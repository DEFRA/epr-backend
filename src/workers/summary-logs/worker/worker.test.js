import { SUMMARY_LOG_STATUS } from '#domain/summary-log.js'

import { summaryLogsValidatorWorker } from './worker.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import {
  buildSummaryLog,
  buildFile
} from '#repositories/summary-logs/contract/test-data.js'

const mockLoggerInfo = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args)
  }
}))

describe('summaryLogsValidatorWorker', () => {
  let summaryLogsRepository
  let summaryLog

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }

  beforeEach(async () => {
    vi.useFakeTimers()

    const repositoryFactory = createInMemorySummaryLogsRepository()
    summaryLogsRepository = repositoryFactory(mockLogger)

    const summaryLogData = buildSummaryLog('summary-log-123', {
      status: SUMMARY_LOG_STATUS.VALIDATING,
      file: buildFile({
        id: 'file-123',
        name: 'test.xlsx',
        status: 'complete',
        s3: {
          bucket: 'test-bucket',
          key: 'test-key'
        }
      })
    })

    await summaryLogsRepository.insert(summaryLogData)
    summaryLog = await summaryLogsRepository.findById('summary-log-123')
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

    const updated = await summaryLogsRepository.findById('summary-log-123')
    expect(updated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
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

  it('should throw error if repository update fails', async () => {
    const brokenRepository = {
      ...summaryLogsRepository,
      update: vi.fn().mockRejectedValue(new Error('Database error'))
    }

    const workerPromise = summaryLogsValidatorWorker({
      summaryLogsRepository: brokenRepository,
      summaryLog
    }).catch((err) => err)

    await vi.runAllTimersAsync()

    const result = await workerPromise
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Database error')
  })
})
