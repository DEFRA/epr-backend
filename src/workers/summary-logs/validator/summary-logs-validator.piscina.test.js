import {
  closeWorkerPool,
  createSummaryLogsValidator
} from './summary-logs-validator.piscina.js'

const { mockRun, mockDestroy, mockLoggerInfo, mockLoggerError } = vi.hoisted(
  () => ({
    mockRun: vi.fn(),
    mockDestroy: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerError: vi.fn()
  })
)

vi.mock('piscina', () => ({
  default: vi.fn(() => ({
    run: mockRun,
    destroy: mockDestroy
  }))
}))

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  }
}))

describe('createSummaryLogsValidator', () => {
  let summaryLogsValidator
  let summaryLog

  beforeEach(() => {
    mockRun.mockResolvedValue(undefined)
    mockDestroy.mockResolvedValue(undefined)

    summaryLogsValidator = createSummaryLogsValidator()

    summaryLog = {
      id: 'summary-log-123',
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
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('creates validator instance', () => {
    expect(summaryLogsValidator).toBeDefined()
    expect(summaryLogsValidator.validate).toBeInstanceOf(Function)
  })

  it('runs worker with summary log', async () => {
    await summaryLogsValidator.validate(summaryLog)

    expect(mockRun).toHaveBeenCalledWith({ summaryLog })
  })

  it('logs success when worker completes', async () => {
    await summaryLogsValidator.validate(summaryLog)

    // Wait for promise chain to complete
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Summary log validation worker completed [summary-log-123]',
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

    await summaryLogsValidator.validate(summaryLog)

    // Wait for promise chain to complete
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockLoggerError).toHaveBeenCalledWith({
      error,
      message: 'Summary log validation worker failed [summary-log-123]',
      event: {
        category: 'server',
        action: 'process_failure'
      }
    })
  })

  it('does not throw when worker succeeds', async () => {
    await expect(
      summaryLogsValidator.validate(summaryLog)
    ).resolves.toBeUndefined()
  })

  it('does not throw when worker fails', async () => {
    mockRun.mockRejectedValue(new Error('Worker failed'))

    await expect(
      summaryLogsValidator.validate(summaryLog)
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
