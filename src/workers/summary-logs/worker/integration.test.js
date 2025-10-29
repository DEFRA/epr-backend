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
  let summaryLogUpdater
  let summaryLogsRepository

  beforeEach(async () => {
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
    summaryLogUpdater = new SummaryLogUpdater({ summaryLogsRepository })
  })

  const createTestOrg = (wasteProcessingType, wasteRegistrationNumber) => {
    return buildOrganisation({
      registrations: [
        {
          id: randomUUID(),
          wasteRegistrationNumber,
          material: 'paper',
          wasteProcessingType,
          formSubmissionTime: new Date(),
          submittedToRegulator: 'ea'
        }
      ]
    })
  }

  const createExtractor = (fileId, metadata) => {
    return createInMemorySummaryLogExtractor({
      [fileId]: {
        meta: metadata,
        data: {}
      }
    })
  }

  const createSummaryLog = (testOrg) => {
    return {
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
  }

  it('should update status as expected when validation succeeds', async () => {
    const testOrg = createTestOrg('reprocessor', 'WRN-123')
    const organisationsRepository = createInMemoryOrganisationsRepository([
      testOrg
    ])()
    const summaryLog = createSummaryLog(testOrg)
    const summaryLogId = randomUUID()

    const summaryLogExtractor = createExtractor(summaryLog.file.id, {
      WASTE_REGISTRATION_NUMBER: {
        value: 'WRN-123',
        location: { sheet: 'Data', row: 1, column: 'B' }
      },
      SUMMARY_LOG_TYPE: {
        value: 'REPROCESSOR',
        location: { sheet: 'Data', row: 2, column: 'B' }
      }
    })

    const summaryLogsValidator = new SummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor,
      summaryLogUpdater
    })

    await summaryLogsRepository.insert(summaryLogId, summaryLog)

    const inserted = await summaryLogsRepository.findById(summaryLogId)

    expect(inserted).toEqual({
      version: 1,
      summaryLog
    })

    await summaryLogsValidator.validate(summaryLogId)

    const updated = await summaryLogsRepository.findById(summaryLogId)

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...summaryLog,
        status: SUMMARY_LOG_STATUS.VALIDATED
      }
    })
  })

  describe.each([
    {
      testCase: 'file could not be found',
      errorMessage: 'Something went wrong while retrieving your file upload'
    },
    {
      testCase: 'file could not be fetched',
      errorMessage: 'S3 access denied'
    },
    {
      testCase: 'file could not be parsed',
      errorMessage: 'File is corrupt and cannot be parsed as zip archive'
    }
  ])('extraction failures', ({ testCase, errorMessage }) => {
    it(`should update status as expected when validation fails because the ${testCase}`, async () => {
      const testOrg = createTestOrg('reprocessor', 'WRN-123')
      const organisationsRepository = createInMemoryOrganisationsRepository([
        testOrg
      ])()
      const summaryLog = createSummaryLog(testOrg)
      const summaryLogId = randomUUID()

      const failingSummaryLogExtractor = {
        extract: async () => {
          throw new Error(errorMessage)
        }
      }

      const summaryLogsValidator = new SummaryLogsValidator({
        summaryLogsRepository,
        organisationsRepository,
        summaryLogExtractor: failingSummaryLogExtractor,
        summaryLogUpdater
      })

      await summaryLogsRepository.insert(summaryLogId, summaryLog)

      const inserted = await summaryLogsRepository.findById(summaryLogId)

      expect(inserted).toEqual({
        version: 1,
        summaryLog
      })

      await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

      const updated = await summaryLogsRepository.findById(summaryLogId)

      expect(updated).toEqual({
        version: 2,
        summaryLog: {
          ...summaryLog,
          status: SUMMARY_LOG_STATUS.INVALID,
          failureReason: errorMessage
        }
      })
    })
  })

  describe.each([
    {
      testCase: 'REPROCESSOR type matches reprocessor registration',
      registrationType: 'reprocessor',
      registrationWRN: 'WRN-123',
      spreadsheetType: 'REPROCESSOR',
      expectedStatus: SUMMARY_LOG_STATUS.VALIDATED,
      expectedFailureReason: undefined
    },
    {
      testCase: 'EXPORTER type matches exporter registration',
      registrationType: 'exporter',
      registrationWRN: 'WRN-456',
      spreadsheetType: 'EXPORTER',
      expectedStatus: SUMMARY_LOG_STATUS.VALIDATED,
      expectedFailureReason: undefined
    },
    {
      testCase: 'EXPORTER type does not match reprocessor registration',
      registrationType: 'reprocessor',
      registrationWRN: 'WRN-123',
      spreadsheetType: 'EXPORTER',
      expectedStatus: SUMMARY_LOG_STATUS.INVALID,
      expectedFailureReason: 'Summary log type does not match registration type'
    },
    {
      testCase: 'REPROCESSOR type does not match exporter registration',
      registrationType: 'exporter',
      registrationWRN: 'WRN-456',
      spreadsheetType: 'REPROCESSOR',
      expectedStatus: SUMMARY_LOG_STATUS.INVALID,
      expectedFailureReason: 'Summary log type does not match registration type'
    },
    {
      testCase: 'type is missing',
      registrationType: 'reprocessor',
      registrationWRN: 'WRN-123',
      spreadsheetType: undefined,
      expectedStatus: SUMMARY_LOG_STATUS.INVALID,
      expectedFailureReason: 'Invalid summary log: missing summary log type'
    },
    {
      testCase: 'type is unrecognized',
      registrationType: 'reprocessor',
      registrationWRN: 'WRN-123',
      spreadsheetType: 'INVALID_TYPE',
      expectedStatus: SUMMARY_LOG_STATUS.INVALID,
      expectedFailureReason:
        'Invalid summary log: unrecognized summary log type'
    }
  ])(
    'type validation',
    ({
      testCase,
      registrationType,
      registrationWRN,
      spreadsheetType,
      expectedStatus,
      expectedFailureReason
    }) => {
      it(`should handle validation when ${testCase}`, async () => {
        const testOrg = createTestOrg(registrationType, registrationWRN)
        const organisationsRepository = createInMemoryOrganisationsRepository([
          testOrg
        ])()
        const summaryLog = createSummaryLog(testOrg)
        const summaryLogId = randomUUID()

        const metadata = {
          WASTE_REGISTRATION_NUMBER: {
            value: registrationWRN,
            location: { sheet: 'Data', row: 1, column: 'B' }
          }
        }

        if (spreadsheetType !== undefined) {
          metadata.SUMMARY_LOG_TYPE = {
            value: spreadsheetType,
            location: { sheet: 'Data', row: 2, column: 'B' }
          }
        }

        const summaryLogExtractor = createExtractor(
          summaryLog.file.id,
          metadata
        )

        const summaryLogsValidator = new SummaryLogsValidator({
          summaryLogsRepository,
          organisationsRepository,
          summaryLogExtractor,
          summaryLogUpdater
        })

        await summaryLogsRepository.insert(summaryLogId, summaryLog)

        await summaryLogsValidator.validate(summaryLogId).catch((err) => err)

        const updated = await summaryLogsRepository.findById(summaryLogId)

        const expectedSummaryLog = {
          ...summaryLog,
          status: expectedStatus
        }

        if (expectedFailureReason) {
          expectedSummaryLog.failureReason = expectedFailureReason
        }

        expect(updated).toEqual({
          version: 2,
          summaryLog: expectedSummaryLog
        })
      })
    }
  )
})
