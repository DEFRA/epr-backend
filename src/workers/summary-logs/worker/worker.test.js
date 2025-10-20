import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'

import { summaryLogsValidatorWorker } from './worker.js'

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

describe('summaryLogsValidatorWorker', () => {
  let uploadsRepository
  let summaryLogsParser
  let summaryLogsRepository
  let summaryLog

  beforeEach(async () => {
    uploadsRepository = {
      findByLocation: vi
        .fn()
        .mockResolvedValue(Buffer.from('mock file content'))
    }

    summaryLogsParser = {
      parse: vi.fn().mockResolvedValue({ parsed: 'data' })
    }

    summaryLogsRepository = {
      update: vi.fn()
    }

    summaryLog = {
      id: 'summary-log-123',
      version: 1,
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
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should log as expected when validation worker starts', async () => {
    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog
    })

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Summary log validation worker started: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx',
        event: expect.objectContaining({
          category: 'worker',
          action: 'start_success'
        })
      })
    )
  })

  it('should fetch file from uploads repository', async () => {
    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog
    })

    expect(uploadsRepository.findByLocation).toHaveBeenCalledWith({
      bucket: 'test-bucket',
      key: 'test-key'
    })
  })

  it('should log as expected when file fetched successfully', async () => {
    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog
    })

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Fetched summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx, s3Path=test-bucket/test-key',
        event: expect.objectContaining({
          category: 'worker',
          action: 'process_success'
        })
      })
    )
  })

  it('should log as expected when file not fetched successfully', async () => {
    uploadsRepository.findByLocation.mockResolvedValue(null)

    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog
    }).catch((err) => err)

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Failed to fetch summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx, s3Path=test-bucket/test-key',
        event: expect.objectContaining({
          category: 'worker',
          action: 'process_failure'
        })
      })
    )
  })

  it('should update status as expected when file is fetched successfully', async () => {
    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog
    })

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.VALIDATED
      }
    )
  })

  it('should update status as expected when file is fetched successfully if existing record indicated failure', async () => {
    summaryLog.failureReason = 'Existing error'

    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog
    })

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.VALIDATED,
        failureReason: null
      }
    )
  })

  it('should update status as expected when file is not fetched successfully', async () => {
    uploadsRepository.findByLocation.mockResolvedValue(null)

    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog
    }).catch((err) => err)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'Something went wrong while retrieving your file upload'
      }
    )
  })

  it('should update status as expected when attempt to fetch file causes an unexpected exception', async () => {
    uploadsRepository.findByLocation.mockRejectedValue(
      new Error('S3 access denied')
    )

    const result = await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog
    }).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('S3 access denied')

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'S3 access denied'
      }
    )
  })

  it('should log as expected when attempt to fetch file causes an unexpected exception', async () => {
    uploadsRepository.findByLocation.mockRejectedValue(
      new Error('S3 access denied')
    )

    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog
    }).catch((err) => err)

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Failed to process summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx',
        event: expect.objectContaining({
          category: 'worker',
          action: 'process_failure'
        })
      })
    )
  })

  it('should log as expected once status updated', async () => {
    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog
    })

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Summary log updated: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx, status=validated',
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

    const result = await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository: brokenRepository,
      summaryLog
    }).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Database error')
  })
})
