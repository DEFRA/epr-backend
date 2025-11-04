import { randomUUID } from 'crypto'

import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'

// Eventual consistency retry configuration
const MAX_RETRIES = 20
const RETRY_DELAY_MS = 25

const waitForVersion = async (repository, id, expectedVersion) => {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const result = await repository.findById(id)
    if (result?.version >= expectedVersion) {
      return result
    }
    /* v8 ignore next 5 */
    if (i < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
  throw new Error(
    `Timeout waiting for version ${expectedVersion} on summary log ${id}`
  )
}

describe('SummaryLogsValidator integration', () => {
  let summaryLogsRepository

  beforeEach(async () => {
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
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

  const runValidation = async ({
    registrationType,
    registrationWRN,
    metadata,
    summaryLogExtractor = null
  }) => {
    const testOrg = createTestOrg(registrationType, registrationWRN)
    const organisationsRepository = createInMemoryOrganisationsRepository([
      testOrg
    ])()
    const summaryLog = createSummaryLog(testOrg)
    const summaryLogId = randomUUID()

    const extractor =
      summaryLogExtractor || createExtractor(summaryLog.file.id, metadata)

    const validateSummaryLog = createSummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor: extractor
    })

    await summaryLogsRepository.insert(summaryLogId, summaryLog)

    await validateSummaryLog(summaryLogId).catch((err) => err)

    const updated = await waitForVersion(summaryLogsRepository, summaryLogId, 2)

    return {
      updated,
      summaryLog
    }
  }

  it('should update status as expected when validation succeeds', async () => {
    const { updated, summaryLog } = await runValidation({
      registrationType: 'reprocessor',
      registrationWRN: 'WRN-123',
      metadata: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN-123',
          location: { sheet: 'Data', row: 1, column: 'B' }
        },
        SUMMARY_LOG_TYPE: {
          value: 'REPROCESSOR',
          location: { sheet: 'Data', row: 2, column: 'B' }
        },
        MATERIAL: {
          value: 'Paper_and_board',
          location: { sheet: 'Data', row: 3, column: 'B' }
        }
      }
    })

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...summaryLog,
        status: SUMMARY_LOG_STATUS.VALIDATED
      }
    })
  })

  it('should fail validation when extraction throws error', async () => {
    const errorMessage = 'Test extraction error'
    const { updated, summaryLog } = await runValidation({
      registrationType: 'reprocessor',
      registrationWRN: 'WRN-123',
      summaryLogExtractor: {
        extract: async () => {
          throw new Error(errorMessage)
        }
      }
    })

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...summaryLog,
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: errorMessage
      }
    })
  })

  describe('successful type matching', () => {
    describe.each([
      {
        registrationType: 'reprocessor',
        registrationWRN: 'WRN-123',
        spreadsheetType: 'REPROCESSOR'
      },
      {
        registrationType: 'exporter',
        registrationWRN: 'WRN-456',
        spreadsheetType: 'EXPORTER'
      }
    ])(
      'when $spreadsheetType type matches $registrationType registration',
      ({ registrationType, registrationWRN, spreadsheetType }) => {
        it('should validate successfully', async () => {
          const { updated, summaryLog } = await runValidation({
            registrationType,
            registrationWRN,
            metadata: {
              WASTE_REGISTRATION_NUMBER: {
                value: registrationWRN,
                location: { sheet: 'Data', row: 1, column: 'B' }
              },
              SUMMARY_LOG_TYPE: {
                value: spreadsheetType,
                location: { sheet: 'Data', row: 2, column: 'B' }
              },
              MATERIAL: {
                value: 'Paper_and_board',
                location: { sheet: 'Data', row: 3, column: 'B' }
              }
            }
          })

          expect(updated).toEqual({
            version: 2,
            summaryLog: {
              ...summaryLog,
              status: SUMMARY_LOG_STATUS.VALIDATED
            }
          })
        })
      }
    )
  })

  describe('type mismatches', () => {
    describe.each([
      {
        registrationType: 'reprocessor',
        registrationWRN: 'WRN-123',
        spreadsheetType: 'EXPORTER'
      },
      {
        registrationType: 'exporter',
        registrationWRN: 'WRN-456',
        spreadsheetType: 'REPROCESSOR'
      }
    ])(
      'when $spreadsheetType type does not match $registrationType registration',
      ({ registrationType, registrationWRN, spreadsheetType }) => {
        it('should fail validation with mismatch error', async () => {
          const { updated, summaryLog } = await runValidation({
            registrationType,
            registrationWRN,
            metadata: {
              WASTE_REGISTRATION_NUMBER: {
                value: registrationWRN,
                location: { sheet: 'Data', row: 1, column: 'B' }
              },
              SUMMARY_LOG_TYPE: {
                value: spreadsheetType,
                location: { sheet: 'Data', row: 2, column: 'B' }
              }
            }
          })

          expect(updated).toEqual({
            version: 2,
            summaryLog: {
              ...summaryLog,
              status: SUMMARY_LOG_STATUS.INVALID,
              failureReason: 'Summary log type does not match registration type'
            }
          })
        })
      }
    )
  })

  describe('invalid type scenarios', () => {
    it('should fail validation when type is missing', async () => {
      const { updated, summaryLog } = await runValidation({
        registrationType: 'reprocessor',
        registrationWRN: 'WRN-123',
        metadata: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          }
        }
      })

      expect(updated).toEqual({
        version: 2,
        summaryLog: {
          ...summaryLog,
          status: SUMMARY_LOG_STATUS.INVALID,
          failureReason: 'Invalid summary log: missing summary log type'
        }
      })
    })

    it('should fail validation when type is unrecognized', async () => {
      const { updated, summaryLog } = await runValidation({
        registrationType: 'reprocessor',
        registrationWRN: 'WRN-123',
        metadata: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          },
          SUMMARY_LOG_TYPE: {
            value: 'INVALID_TYPE',
            location: { sheet: 'Data', row: 2, column: 'B' }
          }
        }
      })

      expect(updated).toEqual({
        version: 2,
        summaryLog: {
          ...summaryLog,
          status: SUMMARY_LOG_STATUS.INVALID,
          failureReason: 'Summary log type does not match registration type'
        }
      })
    })
  })
})
