import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import { closeWorkerPool, createSummaryLogsCommandExecutor } from './piscina.js'

const { mockRun, mockDestroy, MockPiscina } = vi.hoisted(() => {
  const mockRun = vi.fn()
  const mockDestroy = vi.fn()
  const MockPiscina = vi.fn(function () {
    return {
      run: mockRun,
      destroy: mockDestroy
    }
  })
  return { mockRun, mockDestroy, MockPiscina }
})

vi.mock('piscina', () => ({
  Piscina: MockPiscina
}))

describe('createSummaryLogsCommandExecutor', () => {
  let summaryLogsWorker
  let summaryLogId
  let logger

  /**
   * This is the "main thread" repository - passed to createSummaryLogsCommandExecutor.
   *
   * IMPORTANT: This is NOT the same repository used inside the worker thread.
   * The worker thread (worker-thread.js) creates its own repository instance
   * for normal status updates (e.g., validating → validated).
   *
   * This repository is ONLY used by the timeout tracker as a "safety net"
   * to mark summary logs as validation_failed when:
   *   - The worker thread crashes (promise rejects)
   *   - The worker thread hangs forever (timeout fires)
   *
   * In success cases, this repository should NOT be called - the worker thread
   * handles the status update itself using its own repository instance.
   */
  let mainThreadRepository

  beforeEach(() => {
    mockRun.mockResolvedValue(undefined)
    mockDestroy.mockResolvedValue(undefined)

    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    mainThreadRepository = {
      findById: vi.fn(),
      update: vi.fn()
    }

    summaryLogsWorker = createSummaryLogsCommandExecutor(
      logger,
      mainThreadRepository
    )

    summaryLogId = 'summary-log-123'
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('creates command executor instance', () => {
    expect(summaryLogsWorker).toBeDefined()
    expect(summaryLogsWorker.validate).toBeInstanceOf(Function)
  })

  it('runs worker with command object', async () => {
    await summaryLogsWorker.validate(summaryLogId)

    expect(mockRun).toHaveBeenCalledWith({
      command: 'validate',
      summaryLogId
    })
  })

  it('logs success when worker completes', async () => {
    await summaryLogsWorker.validate(summaryLogId)

    // Wait for promise chain to complete
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Summary log validate worker completed: summaryLogId=summary-log-123',
        event: {
          category: 'server',
          action: 'process_success'
        }
      })
    )
  })

  it('logs error when worker fails', async () => {
    const error = new Error('Worker failed')
    mockRun.mockRejectedValue(error)

    await summaryLogsWorker.validate(summaryLogId)

    // Wait for promise chain to complete
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(logger.error).toHaveBeenCalledWith({
      error,
      message:
        'Summary log validate worker failed: summaryLogId=summary-log-123',
      event: {
        category: 'server',
        action: 'process_failure'
      }
    })
  })

  it('does not throw when worker succeeds', async () => {
    await expect(
      summaryLogsWorker.validate(summaryLogId)
    ).resolves.toBeUndefined()
  })

  it('does not throw when worker fails', async () => {
    mockRun.mockRejectedValue(new Error('Worker failed'))

    await expect(
      summaryLogsWorker.validate(summaryLogId)
    ).resolves.toBeUndefined()
  })

  describe('submit', () => {
    it('has submit method', () => {
      expect(summaryLogsWorker.submit).toBeInstanceOf(Function)
    })

    it('runs worker with submit command object', async () => {
      await summaryLogsWorker.submit(summaryLogId)

      expect(mockRun).toHaveBeenCalledWith({
        command: 'submit',
        summaryLogId
      })
    })

    it('logs success when submit worker completes', async () => {
      await summaryLogsWorker.submit(summaryLogId)

      // Wait for promise chain to complete
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'Summary log submit worker completed: summaryLogId=summary-log-123',
          event: {
            category: 'server',
            action: 'process_success'
          }
        })
      )
    })

    it('logs error when submit worker fails', async () => {
      const error = new Error('Submit worker failed')
      mockRun.mockRejectedValue(error)

      await summaryLogsWorker.submit(summaryLogId)

      // Wait for promise chain to complete
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(logger.error).toHaveBeenCalledWith({
        error,
        message:
          'Summary log submit worker failed: summaryLogId=summary-log-123',
        event: {
          category: 'server',
          action: 'process_failure'
        }
      })
    })
  })

  describe('timeout tracker', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    describe('when worker completes before timeout', () => {
      it('does not mark summary log as validation_failed', async () => {
        // Worker completes successfully
        mockRun.mockResolvedValue(undefined)

        await summaryLogsWorker.validate(summaryLogId)

        // Wait for promise chain to complete
        await vi.runAllTimersAsync()

        // Main thread repository should NOT be called - the worker thread
        // handles the status update (to validated/invalid) using its own repository
        expect(mainThreadRepository.update).not.toHaveBeenCalled()
      })

      it('clears the timeout timer', async () => {
        // Worker completes successfully
        mockRun.mockResolvedValue(undefined)

        await summaryLogsWorker.validate(summaryLogId)

        // Wait for promise chain to complete
        await vi.runAllTimersAsync()

        // Advance time past the timeout period
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000) // 10 minutes

        // Main thread repository should NOT be called even after timeout period
        // because the timeout was cleared when the worker completed successfully
        expect(mainThreadRepository.update).not.toHaveBeenCalled()
      })
    })

    // When the worker crashes, it can't update the status itself.
    // The main thread's "safety net" repository must step in to mark as validation_failed.
    describe('when worker fails before timeout', () => {
      it('marks summary log as validation_failed', async () => {
        // Worker crashes (e.g., OOM, unhandled exception)
        const error = new Error('Worker crashed')
        mockRun.mockRejectedValue(error)

        mainThreadRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.VALIDATING
          }
        })
        mainThreadRepository.update.mockResolvedValue(undefined)

        await summaryLogsWorker.validate(summaryLogId)

        // Wait for promise chain to complete
        await vi.runAllTimersAsync()

        // Main thread repository IS called because worker crashed and couldn't update status
        expect(mainThreadRepository.findById).toHaveBeenCalledWith(summaryLogId)
        expect(mainThreadRepository.update).toHaveBeenCalledWith(
          summaryLogId,
          1,
          {
            status: SUMMARY_LOG_STATUS.VALIDATION_FAILED,
            expiresAt: expect.any(Date)
          }
        )
      })

      it('clears the timeout timer', async () => {
        const error = new Error('Worker crashed')
        mockRun.mockRejectedValue(error)

        mainThreadRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.VALIDATING
          }
        })
        mainThreadRepository.update.mockResolvedValue(undefined)

        await summaryLogsWorker.validate(summaryLogId)

        // Wait for promise chain to complete
        await vi.runAllTimersAsync()

        // Reset mock to check it's not called again
        mainThreadRepository.update.mockClear()

        // Advance time past the timeout period
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

        // Should not call update again because timeout was cleared
        expect(mainThreadRepository.update).not.toHaveBeenCalled()
      })

      it('only marks as validation_failed if status is still processing', async () => {
        const error = new Error('Worker crashed')
        mockRun.mockRejectedValue(error)

        // Summary log has already transitioned to a terminal state
        mainThreadRepository.findById.mockResolvedValue({
          version: 2,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.VALIDATED
          }
        })

        await summaryLogsWorker.validate(summaryLogId)

        // Wait for promise chain to complete
        await vi.runAllTimersAsync()

        expect(mainThreadRepository.findById).toHaveBeenCalledWith(summaryLogId)
        // Should not update because status is no longer a processing state
        expect(mainThreadRepository.update).not.toHaveBeenCalled()
      })

      it('logs warning if summary log not found', async () => {
        const error = new Error('Worker crashed')
        mockRun.mockRejectedValue(error)

        mainThreadRepository.findById.mockResolvedValue(null)

        await summaryLogsWorker.validate(summaryLogId)

        // Wait for promise chain to complete
        await vi.runAllTimersAsync()

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining(
              'Cannot mark as validation_failed'
            ),
            summaryLogId
          })
        )
        expect(mainThreadRepository.update).not.toHaveBeenCalled()
      })

      it('logs error if update fails', async () => {
        const workerError = new Error('Worker crashed')
        const updateError = new Error('Database connection failed')
        mockRun.mockRejectedValue(workerError)

        mainThreadRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.VALIDATING
          }
        })
        mainThreadRepository.update.mockRejectedValue(updateError)

        await summaryLogsWorker.validate(summaryLogId)

        // Wait for promise chain to complete
        await vi.runAllTimersAsync()

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: updateError,
            message: expect.stringContaining(
              'Failed to mark summary log as validation_failed'
            ),
            summaryLogId
          })
        )
      })
    })

    // When the worker hangs forever, it can't update the status itself.
    // The main thread's timeout fires and marks as validation_failed.
    describe('when timeout fires before worker completes', () => {
      it('marks summary log as validation_failed', async () => {
        // Worker hangs forever (e.g., infinite loop, deadlock)
        mockRun.mockImplementation(() => new Promise(() => {}))

        mainThreadRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.VALIDATING
          }
        })
        mainThreadRepository.update.mockResolvedValue(undefined)

        await summaryLogsWorker.validate(summaryLogId)

        // Advance time to trigger timeout (default 5 minutes)
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

        // Main thread repository IS called because worker hung and couldn't update status
        expect(mainThreadRepository.findById).toHaveBeenCalledWith(summaryLogId)
        expect(mainThreadRepository.update).toHaveBeenCalledWith(
          summaryLogId,
          1,
          {
            status: SUMMARY_LOG_STATUS.VALIDATION_FAILED,
            expiresAt: expect.any(Date)
          }
        )
      })

      it('logs timeout error', async () => {
        mockRun.mockImplementation(() => new Promise(() => {}))

        mainThreadRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.VALIDATING
          }
        })
        mainThreadRepository.update.mockResolvedValue(undefined)

        await summaryLogsWorker.validate(summaryLogId)

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('worker timed out'),
            summaryLogId
          })
        )
      })

      it('only marks as validation_failed if status is still processing', async () => {
        mockRun.mockImplementation(() => new Promise(() => {}))

        // Summary log has already transitioned to validated (maybe via another path)
        mainThreadRepository.findById.mockResolvedValue({
          version: 2,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.VALIDATED
          }
        })

        await summaryLogsWorker.validate(summaryLogId)

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(mainThreadRepository.findById).toHaveBeenCalledWith(summaryLogId)
        expect(mainThreadRepository.update).not.toHaveBeenCalled()
      })

      it('handles preprocessing status', async () => {
        mockRun.mockImplementation(() => new Promise(() => {}))

        mainThreadRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.PREPROCESSING
          }
        })
        mainThreadRepository.update.mockResolvedValue(undefined)

        await summaryLogsWorker.validate(summaryLogId)

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(mainThreadRepository.update).toHaveBeenCalledWith(
          summaryLogId,
          1,
          {
            status: SUMMARY_LOG_STATUS.VALIDATION_FAILED,
            expiresAt: expect.any(Date)
          }
        )
      })
    })

    describe('submit command timeout', () => {
      it('does not mark as validation_failed for submit command failures', async () => {
        const error = new Error('Submit worker crashed')
        mockRun.mockRejectedValue(error)

        await summaryLogsWorker.submit(summaryLogId)

        // Wait for promise chain to complete
        await vi.runAllTimersAsync()

        // Submit failures should not trigger validation_failed marking
        // (submission failures are handled differently - Phase 3)
        expect(mainThreadRepository.findById).not.toHaveBeenCalled()
        expect(mainThreadRepository.update).not.toHaveBeenCalled()
      })

      it('does not mark as validation_failed on submit timeout', async () => {
        mockRun.mockImplementation(() => new Promise(() => {}))

        await summaryLogsWorker.submit(summaryLogId)

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

        // Submit timeouts should not trigger validation_failed marking
        expect(mainThreadRepository.findById).not.toHaveBeenCalled()
        expect(mainThreadRepository.update).not.toHaveBeenCalled()
      })
    })

    describe('concurrent tasks', () => {
      it('tracks multiple tasks independently', async () => {
        const summaryLogId1 = 'summary-log-1'
        const summaryLogId2 = 'summary-log-2'

        // First task hangs, second completes
        let resolveSecond
        mockRun
          .mockImplementationOnce(() => new Promise(() => {})) // hangs
          .mockImplementationOnce(
            () => new Promise((resolve) => (resolveSecond = resolve))
          )

        mainThreadRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog: {
            status: SUMMARY_LOG_STATUS.VALIDATING
          }
        })
        mainThreadRepository.update.mockResolvedValue(undefined)

        await summaryLogsWorker.validate(summaryLogId1)
        await summaryLogsWorker.validate(summaryLogId2)

        // Complete the second task
        resolveSecond()
        await vi.runAllTimersAsync()

        // Only first task should timeout
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

        // Should only update the first summary log (the one that timed out)
        expect(mainThreadRepository.update).toHaveBeenCalledTimes(1)
        expect(mainThreadRepository.update).toHaveBeenCalledWith(
          summaryLogId1,
          1,
          {
            status: SUMMARY_LOG_STATUS.VALIDATION_FAILED,
            expiresAt: expect.any(Date)
          }
        )
      })
    })
  })
})

describe('closeWorkerPool', () => {
  it('destroys the worker pool', async () => {
    await closeWorkerPool()

    expect(mockDestroy).toHaveBeenCalled()
  })

  it('resolves successfully when pool is destroyed', async () => {
    await expect(closeWorkerPool()).resolves.toBeUndefined()
  })
})

describe('Piscina configuration', () => {
  // Piscina is instantiated at module load time, before afterEach resets mocks.
  // We capture the constructor args before any tests run.
  const constructorArgs = MockPiscina.mock.calls[0]?.[0]

  it('is created with resource limits to prevent memory exhaustion', () => {
    expect(constructorArgs).toBeDefined()
    expect(constructorArgs.resourceLimits).toBeDefined()
    expect(
      constructorArgs.resourceLimits.maxOldGenerationSizeMb
    ).toBeGreaterThan(0)
    expect(
      constructorArgs.resourceLimits.maxYoungGenerationSizeMb
    ).toBeGreaterThan(0)
    expect(constructorArgs.resourceLimits.codeRangeSizeMb).toBeGreaterThan(0)
  })

  it('sets max heap to 512MB to fit within AWS container limits', () => {
    expect(constructorArgs.resourceLimits.maxOldGenerationSizeMb).toBe(512)
  })

  it('is configured with single thread to match vCPU allocation', () => {
    expect(constructorArgs.maxThreads).toBe(1)
  })

  it('has idle timeout set to one minute', () => {
    expect(constructorArgs.idleTimeout).toBe(60_000)
  })
})
