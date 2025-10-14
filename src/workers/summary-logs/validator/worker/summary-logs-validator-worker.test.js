import { SUMMARY_LOG_STATUS } from '#domain/summary-log.js'

import { summaryLogsValidatorWorker } from './summary-logs-validator-worker.js'

const mockLoggerInfo = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args)
  }
}))

describe('summaryLogsValidatorWorker', () => {
  let summaryLogsRepository
  let summaryLog

  beforeEach(() => {
    vi.useFakeTimers()

    summaryLogsRepository = {
      updateStatus: vi.fn().mockResolvedValue(undefined)
    }

    summaryLog = {
      id: 'summary-log-123',
      status: SUMMARY_LOG_STATUS.VALIDATING,
      file: {
        id: 'file-123',
        name: 'test.xlsx',
        status: 'complete',
        s3: {
          bucket: 'test-bucket',
          key: 'test-key'
        }
      }
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it('should log validation worker started', async () => {
    const workerPromise = summaryLogsValidatorWorker({
      summaryLogsRepository,
      summaryLog
    })
    await vi.runAllTimersAsync()
    await workerPromise

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Summary log validation worker started [summary-log-123]',
        event: expect.objectContaining({
          category: 'worker',
          action: 'start_success'
        })
      })
    )
  })

  it('should update status to invalid', async () => {
    const workerPromise = summaryLogsValidatorWorker({
      summaryLogsRepository,
      summaryLog
    })
    await vi.runAllTimersAsync()
    await workerPromise

    expect(summaryLogsRepository.updateStatus).toHaveBeenCalledWith(
      'summary-log-123',
      SUMMARY_LOG_STATUS.INVALID
    )
  })

  it('should log validation status updated', async () => {
    const workerPromise = summaryLogsValidatorWorker({
      summaryLogsRepository,
      summaryLog
    })
    await vi.runAllTimersAsync()
    await workerPromise

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Summary log validation status updated [summary-log-123] to [invalid]',
        event: expect.objectContaining({
          category: 'worker',
          action: 'process_success'
        })
      })
    )
  })

  it('should throw error if status update fails', async () => {
    summaryLogsRepository.updateStatus.mockRejectedValue(
      new Error('Database error')
    )

    const workerPromise = summaryLogsValidatorWorker({
      summaryLogsRepository,
      summaryLog
    }).catch((err) => err)

    await vi.runAllTimersAsync()

    const result = await workerPromise
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Database error')
  })
})
