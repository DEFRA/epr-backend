import { randomUUID } from 'crypto'

import { SummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { SummaryLogUpdater } from '#application/summary-logs/updater.js'
import { SummaryLogsValidator } from '#application/summary-logs/validator.js'
import { ExcelJSSummaryLogsParser } from '#adapters/parsers/summary-logs/exceljs-parser.js'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'

describe('SummaryLogsValidator integration', () => {
  let uploadsRepository
  let summaryLogsParser
  let summaryLogExtractor
  let summaryLogUpdater
  let summaryLogsValidator
  let summaryLogsRepository
  let organisationsRepository

  let summaryLogId
  let initialSummaryLog

  beforeEach(async () => {
    uploadsRepository = createInMemoryUploadsRepository()
    summaryLogsParser = new ExcelJSSummaryLogsParser()
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)

    const testOrg = buildOrganisation({
      registrations: [
        {
          id: randomUUID(),
          wasteRegistrationNumber: 'WRN-123',
          material: 'paper',
          wasteProcessingType: 'reprocessor',
          formSubmissionTime: new Date(),
          submittedToRegulator: 'ea'
        }
      ]
    })

    organisationsRepository = createInMemoryOrganisationsRepository([testOrg])()

    summaryLogExtractor = new SummaryLogExtractor({
      uploadsRepository,
      summaryLogsParser
    })

    summaryLogUpdater = new SummaryLogUpdater({
      summaryLogsRepository
    })

    summaryLogsValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor,
      summaryLogUpdater
    })

    summaryLogId = randomUUID()

    initialSummaryLog = {
      status: SUMMARY_LOG_STATUS.VALIDATING,
      organisationId: testOrg.id,
      registrationId: testOrg.registrations[0].id,
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

  it('should update status as expected when validation succeeds', async () => {
    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

    const inserted = await summaryLogsRepository.findById(summaryLogId)

    expect(inserted).toEqual({
      version: 1,
      summaryLog: initialSummaryLog
    })

    await summaryLogsValidator.validate(summaryLogId)

    const updated = await summaryLogsRepository.findById(summaryLogId)

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...initialSummaryLog,
        status: SUMMARY_LOG_STATUS.VALIDATED
      }
    })
  })

  it('should update status as expected when validation fails because the file could not be found', async () => {
    initialSummaryLog.file.s3.key = 'some-other-key'
    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

    const inserted = await summaryLogsRepository.findById(summaryLogId)

    expect(inserted).toEqual({
      version: 1,
      summaryLog: initialSummaryLog
    })

    await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

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

  it('should update status as expected when validation fails because the file could not be fetched', async () => {
    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

    const inserted = await summaryLogsRepository.findById(summaryLogId)

    expect(inserted).toEqual({
      version: 1,
      summaryLog: initialSummaryLog
    })

    const failingUploadsRepository = createInMemoryUploadsRepository({
      throwError: new Error('S3 access denied')
    })

    const failingSummaryLogExtractor = new SummaryLogExtractor({
      uploadsRepository: failingUploadsRepository,
      summaryLogsParser
    })

    const failingSummaryLogsValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor: failingSummaryLogExtractor,
      summaryLogUpdater
    })

    await failingSummaryLogsValidator.validate(summaryLogId).catch((err) => err)

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

  it('should update status as expected when validation fails because the file could not be parsed', async () => {
    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

    const inserted = await summaryLogsRepository.findById(summaryLogId)

    expect(inserted).toEqual({
      version: 1,
      summaryLog: initialSummaryLog
    })

    const failingParser = {
      parse: vi
        .fn()
        .mockRejectedValue(
          new Error('File is corrupt and cannot be parsed as zip archive')
        )
    }

    const failingSummaryLogExtractor = new SummaryLogExtractor({
      uploadsRepository,
      summaryLogsParser: failingParser
    })

    const failingSummaryLogsValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      summaryLogExtractor: failingSummaryLogExtractor,
      summaryLogUpdater
    })

    await failingSummaryLogsValidator.validate(summaryLogId).catch((err) => err)

    const updated = await summaryLogsRepository.findById(summaryLogId)

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...initialSummaryLog,
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'File is corrupt and cannot be parsed as zip archive'
      }
    })
  })
})
