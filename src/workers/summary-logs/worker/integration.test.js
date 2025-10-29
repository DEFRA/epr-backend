import { randomUUID } from 'crypto'

import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { SummaryLogUpdater } from '#application/summary-logs/updater.js'
import { SummaryLogsValidator } from '#application/summary-logs/validator.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'

describe('SummaryLogsValidator integration', () => {
  let summaryLogExtractor
  let summaryLogUpdater
  let summaryLogsValidator
  let summaryLogsRepository
  let organisationsRepository

  let summaryLogId
  let initialSummaryLog

  beforeEach(async () => {
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

    const fileId = initialSummaryLog.file.id

    summaryLogExtractor = createInMemorySummaryLogExtractor({
      [fileId]: {
        meta: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          },
          SUMMARY_LOG_TYPE: {
            value: 'REPROCESSOR',
            location: { sheet: 'Data', row: 2, column: 'B' }
          }
        },
        data: {}
      }
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

    const failingSummaryLogExtractor = {
      extract: async () => {
        throw new Error(
          'Something went wrong while retrieving your file upload'
        )
      }
    }

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

    const failingSummaryLogExtractor = {
      extract: async () => {
        throw new Error('S3 access denied')
      }
    }

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

    const failingSummaryLogExtractor = {
      extract: async () => {
        throw new Error('File is corrupt and cannot be parsed as zip archive')
      }
    }

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
        failureReason: 'File is corrupt and cannot be parsed as zip archive'
      }
    })
  })

  it('should validate successfully when SUMMARY_LOG_TYPE is REPROCESSOR and registration is reprocessor', async () => {
    const fileId = initialSummaryLog.file.id

    summaryLogExtractor = createInMemorySummaryLogExtractor({
      [fileId]: {
        meta: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          },
          SUMMARY_LOG_TYPE: {
            value: 'REPROCESSOR',
            location: { sheet: 'Data', row: 2, column: 'B' }
          }
        },
        data: {}
      }
    })

    summaryLogsValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor,
      summaryLogUpdater
    })

    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

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

  it('should fail validation when SUMMARY_LOG_TYPE is EXPORTER but registration is reprocessor', async () => {
    const fileId = initialSummaryLog.file.id

    summaryLogExtractor = createInMemorySummaryLogExtractor({
      [fileId]: {
        meta: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          },
          SUMMARY_LOG_TYPE: {
            value: 'EXPORTER',
            location: { sheet: 'Data', row: 2, column: 'B' }
          }
        },
        data: {}
      }
    })

    summaryLogsValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor,
      summaryLogUpdater
    })

    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

    await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

    const updated = await summaryLogsRepository.findById(summaryLogId)

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...initialSummaryLog,
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'Summary log type does not match registration type'
      }
    })
  })

  it('should fail validation when SUMMARY_LOG_TYPE is missing', async () => {
    const fileId = initialSummaryLog.file.id

    summaryLogExtractor = createInMemorySummaryLogExtractor({
      [fileId]: {
        meta: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          }
        },
        data: {}
      }
    })

    summaryLogsValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor,
      summaryLogUpdater
    })

    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

    await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

    const updated = await summaryLogsRepository.findById(summaryLogId)

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...initialSummaryLog,
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'Invalid summary log: missing summary log type'
      }
    })
  })

  it('should fail validation when SUMMARY_LOG_TYPE is unrecognized', async () => {
    const fileId = initialSummaryLog.file.id

    summaryLogExtractor = createInMemorySummaryLogExtractor({
      [fileId]: {
        meta: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          },
          SUMMARY_LOG_TYPE: {
            value: 'INVALID_TYPE',
            location: { sheet: 'Data', row: 2, column: 'B' }
          }
        },
        data: {}
      }
    })

    summaryLogsValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor,
      summaryLogUpdater
    })

    await summaryLogsRepository.insert(summaryLogId, initialSummaryLog)

    await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

    const updated = await summaryLogsRepository.findById(summaryLogId)

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...initialSummaryLog,
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'Invalid summary log: unrecognized summary log type'
      }
    })
  })

  it('should validate successfully when SUMMARY_LOG_TYPE is EXPORTER and registration is exporter', async () => {
    const testOrg = buildOrganisation({
      registrations: [
        {
          id: randomUUID(),
          wasteRegistrationNumber: 'WRN-456',
          material: 'plastic',
          wasteProcessingType: 'exporter',
          formSubmissionTime: new Date(),
          submittedToRegulator: 'ea'
        }
      ]
    })

    organisationsRepository = createInMemoryOrganisationsRepository([testOrg])()

    const exporterSummaryLogId = randomUUID()
    const exporterSummaryLog = {
      status: SUMMARY_LOG_STATUS.VALIDATING,
      organisationId: testOrg.id,
      registrationId: testOrg.registrations[0].id,
      file: {
        id: `file-${randomUUID()}`,
        name: 'exporter-test.xlsx',
        status: UPLOAD_STATUS.COMPLETE,
        s3: {
          bucket: 'test-bucket',
          key: 'path/to/exporter-summary-log.xlsx'
        }
      }
    }

    const fileId = exporterSummaryLog.file.id

    summaryLogExtractor = createInMemorySummaryLogExtractor({
      [fileId]: {
        meta: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-456',
            location: { sheet: 'Data', row: 1, column: 'B' }
          },
          SUMMARY_LOG_TYPE: {
            value: 'EXPORTER',
            location: { sheet: 'Data', row: 2, column: 'B' }
          }
        },
        data: {}
      }
    })

    summaryLogsValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor,
      summaryLogUpdater
    })

    await summaryLogsRepository.insert(exporterSummaryLogId, exporterSummaryLog)

    await summaryLogsValidator.validate(exporterSummaryLogId)

    const updated = await summaryLogsRepository.findById(exporterSummaryLogId)

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...exporterSummaryLog,
        status: SUMMARY_LOG_STATUS.VALIDATED
      }
    })
  })
})
