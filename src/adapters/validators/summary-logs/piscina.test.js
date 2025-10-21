import { closeWorkerPool, createSummaryLogsValidator } from './piscina.js'

const { mockRun, mockDestroy } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockDestroy: vi.fn()
}))

vi.mock('piscina', () => ({
  Piscina: vi.fn(() => ({
    run: mockRun,
    destroy: mockDestroy
  }))
}))

describe('createSummaryLogsValidator', () => {
  let summaryLogsValidator
  let validationRequest
  let logger

  beforeEach(() => {
    mockRun.mockResolvedValue(undefined)
    mockDestroy.mockResolvedValue(undefined)

    logger = {
      info: vi.fn(),
      error: vi.fn()
    }

    summaryLogsValidator = createSummaryLogsValidator(logger)

    validationRequest = {
      id: 'summary-log-123',
      version: 1,
      summaryLog: {
        status: 'validating',
        file: {
          id: 'file-123',
          name: 'test.xlsx',
          s3: {
            bucket: 'test-bucket',
            key: 'test-key'
          }
        }
      }
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('creates validator instance', () => {
    expect(summaryLogsValidator).toBeDefined()
    expect(summaryLogsValidator.validate).toBeInstanceOf(Function)
  })

  it('runs worker with summary log', async () => {
    await summaryLogsValidator.validate(validationRequest)

    expect(mockRun).toHaveBeenCalledWith(validationRequest)
  })

  it('logs success when worker completes', async () => {
    await summaryLogsValidator.validate(validationRequest)

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

    await summaryLogsValidator.validate(validationRequest)

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
      summaryLogsValidator.validate(validationRequest)
    ).resolves.toBeUndefined()
  })

  it('does not throw when worker fails', async () => {
    mockRun.mockRejectedValue(new Error('Worker failed'))

    await expect(
      summaryLogsValidator.validate(validationRequest)
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
