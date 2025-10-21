import { randomUUID } from 'crypto'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'

import { summaryLogsValidatorWorker } from './worker.js'
import { createSummaryLogsParser } from '#adapters/parsers/summary-logs/stub.js'

describe('summaryLogsValidatorWorker integration', () => {
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
      id: summaryLogId,
      status: SUMMARY_LOG_STATUS.VALIDATING,
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
    await summaryLogsRepository.insert(initialSummaryLog)

    const insertedSummaryLog =
      await summaryLogsRepository.findById(summaryLogId)

    expect(insertedSummaryLog).toEqual({
      ...initialSummaryLog,
      version: 1
    })

    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog: insertedSummaryLog
    })

    const updatedSummaryLog = await summaryLogsRepository.findById(summaryLogId)

    expect(updatedSummaryLog).toEqual({
      ...insertedSummaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED,
      version: 2
    })
  })

  it('should update status to invalid with failure reason when file is not found', async () => {
    initialSummaryLog.file.s3.key = 'some-other-key'
    await summaryLogsRepository.insert(initialSummaryLog)

    const insertedSummaryLog =
      await summaryLogsRepository.findById(summaryLogId)

    expect(insertedSummaryLog).toEqual({
      ...initialSummaryLog,
      version: 1
    })

    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog: insertedSummaryLog
    }).catch((err) => err)

    const updatedSummaryLog = await summaryLogsRepository.findById(summaryLogId)

    expect(updatedSummaryLog).toEqual({
      ...insertedSummaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: 'Something went wrong while retrieving your file upload',
      version: 2
    })
  })

  it('should still update status even if file fetch fails', async () => {
    await summaryLogsRepository.insert(initialSummaryLog)

    const insertedSummaryLog =
      await summaryLogsRepository.findById(summaryLogId)

    expect(insertedSummaryLog).toEqual({
      ...initialSummaryLog,
      version: 1
    })

    uploadsRepository.error = new Error('S3 access denied')

    await summaryLogsValidatorWorker({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLog: insertedSummaryLog
    }).catch((err) => err)

    const updatedSummaryLog = await summaryLogsRepository.findById(summaryLogId)

    expect(updatedSummaryLog).toEqual({
      ...insertedSummaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: 'S3 access denied',
      version: 2
    })
  })
})
