import { randomUUID } from 'crypto'

import { summaryLogsValidator } from '#application/summary-logs/validator.js'
import { createSummaryLogsParser } from '#adapters/parsers/summary-logs/stub.js'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'

describe('summaryLogsValidator integration', () => {
  let uploadsRepository
  let summaryLogsParser
  let summaryLogsRepository

  let summaryLogId
  let initialSummaryLog

  beforeEach(async () => {
    uploadsRepository = createInMemoryUploadsRepository()
    summaryLogsParser = createSummaryLogsParser()
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)

    summaryLogId = randomUUID()

    initialSummaryLog = {
      status: SUMMARY_LOG_STATUS.VALIDATING,
      registrationId: 'reg-456',
      file: {
        id: `file-${randomUUID()}`,
        name: 'test.xlsx',
        status: UPLOAD_STATUS.COMPLETE,
        s3: {
          bucket: 'test-bucket',
          key: 'path/to/summary-log.xlsx'
        }
      }
    }
  })

  it('should update status to validated when file is fetched successfully', async () => {
    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

    const inserted = await summaryLogsRepository.findById(summaryLogId)

    expect(inserted).toEqual({
      version: 1,
      summaryLog: initialSummaryLog
    })

    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    })

    const updated = await summaryLogsRepository.findById(summaryLogId)

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...initialSummaryLog,
        status: SUMMARY_LOG_STATUS.VALIDATED
      }
    })
  })

  it('should update status to invalid with failure reason when file is not found', async () => {
    initialSummaryLog.file.s3.key = 'some-other-key'
    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

    const inserted = await summaryLogsRepository.findById(summaryLogId)

    expect(inserted).toEqual({
      version: 1,
      summaryLog: initialSummaryLog
    })

    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    }).catch((err) => err)

    const updated = await summaryLogsRepository.findById(summaryLogId)

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...initialSummaryLog,
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'Something went wrong while retrieving your file upload'
      }
    })
  })

  it('should still update status even if file fetch fails', async () => {
    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

    const inserted = await summaryLogsRepository.findById(summaryLogId)

    expect(inserted).toEqual({
      version: 1,
      summaryLog: initialSummaryLog
    })

    const failingUploadsRepository = createInMemoryUploadsRepository({
      throwError: new Error('S3 access denied')
    })

    await summaryLogsValidator({
      uploadsRepository: failingUploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      summaryLogId
    }).catch((err) => err)

    const updated = await summaryLogsRepository.findById(summaryLogId)

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...initialSummaryLog,
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'S3 access denied'
      }
    })
  })
})
