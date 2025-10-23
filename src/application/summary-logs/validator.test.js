import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'

import { summaryLogsValidator } from './validator.js'

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

describe('summaryLogsValidator', () => {
  let uploadsRepository
  let summaryLogsParser
  let summaryLogsRepository
  let summaryLogId
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
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should find summary log by id', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    })

    expect(summaryLogsRepository.findById).toHaveBeenCalledWith(
      'summary-log-123'
    )
  })

  it('should throw error if summary log is not found', async () => {
    summaryLogsRepository.findById.mockResolvedValue(null)

    const result = await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    }).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe(
      'Summary log not found: summaryLogId=summary-log-123'
    )
  })

  it('should log as expected when validation worker starts', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    })

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

  it('should fetch file from uploads repository', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    })

    expect(uploadsRepository.findByLocation).toHaveBeenCalledWith({
      bucket: 'test-bucket',
      key: 'test-key'
    })
  })

  it('should log as expected when file fetched successfully', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    })

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Fetched summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx, s3Path=test-bucket/test-key',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_success'
        })
      })
    )
  })

  it('should log as expected when file not fetched successfully', async () => {
    uploadsRepository.findByLocation.mockResolvedValue(null)

    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    }).catch((err) => err)

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Failed to fetch summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx, s3Path=test-bucket/test-key',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_failure'
        })
      })
    )
  })

  it('should update status as expected when file is fetched successfully', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
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

    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
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

    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
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

    const result = await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
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

    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    }).catch((err) => err)

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Failed to process summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_failure'
        })
      })
    )
  })

  it('should log as expected once status updated', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    })

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
    const brokenRepository = {
      ...summaryLogsRepository,
      update: vi.fn().mockRejectedValue(new Error('Database error'))
    }

    const result = await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository: brokenRepository,
      summaryLogsParser,
      summaryLogId
    }).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Database error')
  })
})
