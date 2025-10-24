import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'

import { SummaryLogsValidator } from './validator.js'

const mockLoggerInfo = vi.fn()
const mockLoggerWarn = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    warn: (...args) => mockLoggerWarn(...args),
    error: (...args) => mockLoggerError(...args)
  }
}))

describe('SummaryLogsValidator', () => {
  let summaryLogExtractor
  let summaryLogUpdater
  let summaryLogsRepository
  let summaryLogsValidator
  let summaryLogId
  let summaryLog

  beforeEach(async () => {
    summaryLogExtractor = {
      extract: vi.fn().mockResolvedValue({ parsed: 'data' })
    }

    summaryLogUpdater = {
      update: vi.fn().mockResolvedValue(undefined)
    }

    summaryLogId = 'summary-log-123'

    summaryLog = {
      status: SUMMARY_LOG_STATUS.VALIDATING,
      file: {
        id: 'file-123',
        name: 'test.xlsx',
        status: UPLOAD_STATUS.COMPLETE,
        s3: {
          bucket: 'test-bucket',
          key: 'test-key'
        }
      }
    }

    summaryLogsRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn()
    }

    summaryLogsValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      summaryLogExtractor,
      summaryLogUpdater
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should find summary log by id', async () => {
    await summaryLogsValidator.validate(summaryLogId)

    expect(summaryLogsRepository.findById).toHaveBeenCalledWith(
      'summary-log-123'
    )
  })

  it('should throw error if summary log is not found', async () => {
    summaryLogsRepository.findById.mockResolvedValue(null)

    const result = await summaryLogsValidator
      .validate(summaryLogId)
      .catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe(
      'Summary log not found: summaryLogId=summary-log-123'
    )
  })

  it('should log as expected when validation starts', async () => {
    await summaryLogsValidator.validate(summaryLogId)

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Summary log validation started: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx',
        event: expect.objectContaining({
          category: 'server',
          action: 'start_success'
        })
      })
    )
  })

  it('should log as expected when extraction succeeds', async () => {
    await summaryLogsValidator.validate(summaryLogId)

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Extracted summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_success'
        })
      })
    )
  })

  it('should update status as expected when extraction succeeds', async () => {
    await summaryLogsValidator.validate(summaryLogId)

    expect(summaryLogUpdater.update).toHaveBeenCalledWith({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED
    })
  })

  it('should update status as expected when extraction succeeds if existing record indicated failure', async () => {
    summaryLog.failureReason = 'Existing error'

    await summaryLogsValidator.validate(summaryLogId)

    expect(summaryLogUpdater.update).toHaveBeenCalledWith({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED
    })
  })

  it('should update status as expected when extraction fails', async () => {
    summaryLogExtractor.extract.mockRejectedValue(
      new Error('Something went wrong while retrieving your file upload')
    )

    await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

    expect(summaryLogUpdater.update).toHaveBeenCalledWith({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: 'Something went wrong while retrieving your file upload'
    })
  })

  it('should update status as expected when extraction causes an unexpected exception', async () => {
    summaryLogExtractor.extract.mockRejectedValue(new Error('S3 access denied'))

    const result = await summaryLogsValidator
      .validate(summaryLogId)
      .catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('S3 access denied')

    expect(summaryLogUpdater.update).toHaveBeenCalledWith({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: 'S3 access denied'
    })
  })

  it('should log as expected when extraction fails', async () => {
    summaryLogExtractor.extract.mockRejectedValue(new Error('S3 access denied'))

    await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Failed to extract summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_failure'
        })
      })
    )
  })

  it('should log as expected once status updated', async () => {
    await summaryLogsValidator.validate(summaryLogId)

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Summary log updated: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx, status=validated',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_success'
        })
      })
    )
  })

  it('should throw error if repository update fails', async () => {
    const brokenUpdater = {
      update: vi.fn().mockRejectedValue(new Error('Database error'))
    }

    const brokenValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      summaryLogExtractor,
      summaryLogUpdater: brokenUpdater
    })

    const result = await brokenValidator
      .validate(summaryLogId)
      .catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Database error')
  })
})
