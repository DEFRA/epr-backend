import { closeWorkerPool, createSummaryLogsValidator } from './piscina.js'

const { mockRun, mockDestroy } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockDestroy: vi.fn()
}))

vi.mock('piscina', () => ({
  Piscina: vi.fn(function () {
    return {
      run: mockRun,
      destroy: mockDestroy
    }
  })
}))

describe('createSummaryLogsValidator', () => {
  let summaryLogsValidator
  let summaryLogId
  let logger

  beforeEach(() => {
    mockRun.mockResolvedValue(undefined)
    mockDestroy.mockResolvedValue(undefined)

    logger = {
      info: vi.fn(),
      error: vi.fn()
    }

    summaryLogsValidator = createSummaryLogsValidator(logger)

    summaryLogId = 'summary-log-123'
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('creates validator instance', () => {
    expect(summaryLogsValidator).toBeDefined()
    expect(summaryLogsValidator.validate).toBeInstanceOf(Function)
  })

  it('runs worker with summary log id', async () => {
    await summaryLogsValidator.validate(summaryLogId)

    expect(mockRun).toHaveBeenCalledWith(summaryLogId)
  })

  it('logs success when worker completes', async () => {
    await summaryLogsValidator.validate(summaryLogId)

    // Wait for promise chain to complete
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Summary log validation worker completed: summaryLogId=summary-log-123',
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

    await summaryLogsValidator.validate(summaryLogId)

    // Wait for promise chain to complete
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(logger.error).toHaveBeenCalledWith({
      error,
      message:
        'Summary log validation worker failed: summaryLogId=summary-log-123',
      event: {
        category: 'server',
        action: 'process_failure'
      }
    })
  })

  it('does not throw when worker succeeds', async () => {
    await expect(
      summaryLogsValidator.validate(summaryLogId)
    ).resolves.toBeUndefined()
  })

  it('does not throw when worker fails', async () => {
    mockRun.mockRejectedValue(new Error('Worker failed'))

    await expect(
      summaryLogsValidator.validate(summaryLogId)
    ).resolves.toBeUndefined()
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
