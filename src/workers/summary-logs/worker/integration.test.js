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

describe('SummaryLogsValidator integration', () => {
  let summaryLogsRepository

  beforeEach(async () => {
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
  })

  const createTestOrg = (
    wasteProcessingType,
    wasteRegistrationNumber,
    accreditationNumber
  ) => {
    const registrationId = randomUUID()

    const accreditation = accreditationNumber
      ? {
          id: randomUUID(),
          accreditationNumber,
          material: 'paper',
          wasteProcessingType,
          formSubmissionTime: new Date(),
          submittedToRegulator: 'ea'
        }
      : undefined

    const registration = {
      id: registrationId,
      wasteRegistrationNumber,
      material: 'paper',
      wasteProcessingType,
      formSubmissionTime: new Date(),
      submittedToRegulator: 'ea',
      ...(accreditation && { accreditationId: accreditation.id })
    }

    return buildOrganisation({
      registrations: [registration],
      accreditations: accreditation ? [accreditation] : []
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
    accreditationNumber,
    metadata,
    summaryLogExtractor = null
  }) => {
    const testOrg = createTestOrg(
      registrationType,
      registrationWRN,
      accreditationNumber
    )
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

    const updated = await summaryLogsRepository.findById(summaryLogId)

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

  describe('accreditation number validation', () => {
    it('should validate successfully when registration has accreditation and numbers match', async () => {
      const accreditationNumber = 87654321

      const { updated, summaryLog } = await runValidation({
        registrationType: 'reprocessor',
        registrationWRN: 'WRN-123',
        accreditationNumber,
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
          },
          ACCREDITATION_NUMBER: {
            value: accreditationNumber,
            location: { sheet: 'Data', row: 4, column: 'B' }
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

    it('should fail validation when registration has accreditation but spreadsheet number does not match', async () => {
      const { updated, summaryLog } = await runValidation({
        registrationType: 'reprocessor',
        registrationWRN: 'WRN-123',
        accreditationNumber: 87654321,
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
          },
          ACCREDITATION_NUMBER: {
            value: 99999999,
            location: { sheet: 'Data', row: 4, column: 'B' }
          }
        }
      })

      expect(updated).toEqual({
        version: 2,
        summaryLog: {
          ...summaryLog,
          status: SUMMARY_LOG_STATUS.INVALID,
          failureReason:
            "Summary log's accreditation number does not match this registration"
        }
      })
    })

    it('should fail validation when registration has accreditation but spreadsheet is missing accreditation number', async () => {
      const { updated, summaryLog } = await runValidation({
        registrationType: 'reprocessor',
        registrationWRN: 'WRN-123',
        accreditationNumber: 87654321,
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
          status: SUMMARY_LOG_STATUS.INVALID,
          failureReason: 'Invalid summary log: missing accreditation number'
        }
      })
    })

    it('should validate successfully when registration has no accreditation and spreadsheet is blank', async () => {
      const { updated, summaryLog } = await runValidation({
        registrationType: 'exporter',
        registrationWRN: 'WRN-456',
        metadata: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-456',
            location: { sheet: 'Data', row: 1, column: 'B' }
          },
          SUMMARY_LOG_TYPE: {
            value: 'EXPORTER',
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

    it('should fail validation when registration has no accreditation but spreadsheet provides number', async () => {
      const { updated, summaryLog } = await runValidation({
        registrationType: 'exporter',
        registrationWRN: 'WRN-456',
        metadata: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-456',
            location: { sheet: 'Data', row: 1, column: 'B' }
          },
          SUMMARY_LOG_TYPE: {
            value: 'EXPORTER',
            location: { sheet: 'Data', row: 2, column: 'B' }
          },
          MATERIAL: {
            value: 'Paper_and_board',
            location: { sheet: 'Data', row: 3, column: 'B' }
          },
          ACCREDITATION_NUMBER: {
            value: 12345678,
            location: { sheet: 'Data', row: 4, column: 'B' }
          }
        }
      })

      expect(updated).toEqual({
        version: 2,
        summaryLog: {
          ...summaryLog,
          status: SUMMARY_LOG_STATUS.INVALID,
          failureReason:
            'Invalid summary log: accreditation number provided but registration has no accreditation'
        }
      })
    })
  })
})
