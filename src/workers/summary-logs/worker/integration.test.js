/** @import {SummaryLogExtractor} from '#domain/summary-logs/extractor/port.js' */
/** @import {MetadataEntry} from '#domain/summary-logs/extractor/port.js' */
/** @import {WasteProcessingTypeValue} from '#domain/organisations/model.js' */

import { randomUUID } from 'crypto'

import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createEmptyLoads } from '#application/summary-logs/classify-loads.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'

describe('SummaryLogsValidator integration', () => {
  let summaryLogsRepository

  beforeEach(async () => {
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
  })

  const createTestOrg = (
    wasteProcessingType,
    registrationNumber,
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
      registrationNumber,
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
        uri: 's3://test-bucket/path/to/summary-log.xlsx'
      }
    }
  }

  /**
   * @typedef {{
   *  registrationType: WasteProcessingTypeValue;
   *  registrationWRN: string;
   *  accreditationNumber?: string;
   *  metadata?: Record<string, MetadataEntry>;
   *  summaryLogExtractor?: SummaryLogExtractor;
   * }} RunValidationParams
   * @param {RunValidationParams} params
   */
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

    const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

    const validateSummaryLog = createSummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      wasteRecordsRepository,
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
      registrationWRN: 'REG-123',
      metadata: {
        REGISTRATION_NUMBER: {
          value: 'REG-123',
          location: { sheet: 'Cover', row: 1, column: 'B' }
        },
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT',
          location: { sheet: 'Cover', row: 2, column: 'B' }
        },
        MATERIAL: {
          value: 'Paper_and_board',
          location: { sheet: 'Cover', row: 3, column: 'B' },
          TEMPLATE_VERSION: {
            value: 1,
            location: { sheet: 'Cover', row: 4, column: 'B' }
          }
        },
        TEMPLATE_VERSION: {
          value: 1,
          location: { sheet: 'Cover', row: 4, column: 'B' }
        }
      }
    })

    expect(updated).toEqual({
      version: 2,
      summaryLog: {
        ...summaryLog,
        status: SUMMARY_LOG_STATUS.VALIDATED,
        validation: {
          issues: []
        },
        loads: createEmptyLoads()
      }
    })
  })

  it('should fail validation when extraction throws error', async () => {
    const errorMessage = 'Test extraction error'
    const { updated, summaryLog } = await runValidation({
      registrationType: 'reprocessor',
      registrationWRN: 'REG-123',
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
        validation: {
          issues: [
            {
              severity: 'fatal',
              category: 'technical',
              message: errorMessage,
              code: 'VALIDATION_SYSTEM_ERROR'
            }
          ]
        }
      }
    })
  })

  describe('successful type matching', () => {
    describe.each([
      {
        registrationType: 'reprocessor',
        registrationWRN: 'REG-123',
        spreadsheetType: 'REPROCESSOR_INPUT'
      },
      {
        registrationType: 'exporter',
        registrationWRN: 'REG-456',
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
              REGISTRATION_NUMBER: {
                value: registrationWRN,
                location: { sheet: 'Cover', row: 1, column: 'B' }
              },
              PROCESSING_TYPE: {
                value: spreadsheetType,
                location: { sheet: 'Cover', row: 2, column: 'B' }
              },
              MATERIAL: {
                value: 'Paper_and_board',
                location: { sheet: 'Cover', row: 3, column: 'B' }
              },
              TEMPLATE_VERSION: {
                value: 1,
                location: { sheet: 'Cover', row: 4, column: 'B' }
              }
            }
          })

          expect(updated).toEqual({
            version: 2,
            summaryLog: {
              ...summaryLog,
              status: SUMMARY_LOG_STATUS.VALIDATED,
              validation: {
                issues: []
              },
              loads: createEmptyLoads()
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
        registrationWRN: 'REG-123',
        spreadsheetType: 'EXPORTER'
      },
      {
        registrationType: 'exporter',
        registrationWRN: 'REG-456',
        spreadsheetType: 'REPROCESSOR_INPUT'
      }
    ])(
      'when $spreadsheetType type does not match $registrationType registration',
      ({ registrationType, registrationWRN, spreadsheetType }) => {
        it('should fail validation with mismatch error', async () => {
          const { updated, summaryLog } = await runValidation({
            registrationType,
            registrationWRN,
            metadata: {
              REGISTRATION_NUMBER: {
                value: registrationWRN,
                location: { sheet: 'Cover', row: 1, column: 'B' }
              },
              PROCESSING_TYPE: {
                value: spreadsheetType,
                location: { sheet: 'Cover', row: 2, column: 'B' }
              },
              MATERIAL: {
                value: 'Paper_and_board',
                location: { sheet: 'Cover', row: 3, column: 'B' }
              },
              TEMPLATE_VERSION: {
                value: 1,
                location: { sheet: 'Cover', row: 4, column: 'B' }
              }
            }
          })

          expect(updated).toEqual({
            version: 2,
            summaryLog: {
              ...summaryLog,
              status: SUMMARY_LOG_STATUS.INVALID,
              validation: {
                issues: [
                  {
                    severity: 'fatal',
                    category: 'business',
                    message:
                      'Summary log processing type does not match registration waste processing type',
                    code: 'PROCESSING_TYPE_MISMATCH',
                    context: {
                      location: {
                        sheet: 'Cover',
                        row: 2,
                        column: 'B',
                        field: 'PROCESSING_TYPE'
                      },
                      expected: registrationType,
                      actual: spreadsheetType
                    }
                  }
                ]
              }
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
        registrationWRN: 'REG-123',
        metadata: {
          REGISTRATION_NUMBER: {
            value: 'REG-123',
            location: { sheet: 'Cover', row: 1, column: 'B' }
          },
          MATERIAL: {
            value: 'Paper_and_board',
            location: { sheet: 'Cover', row: 3, column: 'B' }
          },
          TEMPLATE_VERSION: {
            value: 1,
            location: { sheet: 'Cover', row: 4, column: 'B' }
          }
        }
      })

      expect(updated).toEqual({
        version: 2,
        summaryLog: {
          ...summaryLog,
          status: SUMMARY_LOG_STATUS.INVALID,
          validation: {
            issues: [
              {
                severity: 'fatal',
                category: 'technical',
                message: "Invalid meta field 'PROCESSING_TYPE': is required",
                code: 'PROCESSING_TYPE_REQUIRED',
                context: {
                  location: { field: 'PROCESSING_TYPE' },
                  actual: undefined
                }
              }
            ]
          }
        }
      })
    })

    it('should fail validation when type is unrecognized', async () => {
      const { updated, summaryLog } = await runValidation({
        registrationType: 'reprocessor',
        registrationWRN: 'REG-123',
        metadata: {
          REGISTRATION_NUMBER: {
            value: 'REG-123',
            location: { sheet: 'Cover', row: 1, column: 'B' }
          },
          PROCESSING_TYPE: {
            value: 'INVALID_TYPE',
            location: { sheet: 'Cover', row: 2, column: 'B' }
          },
          MATERIAL: {
            value: 'Paper_and_board',
            location: { sheet: 'Cover', row: 3, column: 'B' }
          },
          TEMPLATE_VERSION: {
            value: 1,
            location: { sheet: 'Cover', row: 4, column: 'B' }
          }
        }
      })

      // Unrecognized type now fails at Level 1 (meta-syntax) with PROCESSING_TYPE_INVALID
      expect(updated).toEqual({
        version: 2,
        summaryLog: {
          ...summaryLog,
          status: SUMMARY_LOG_STATUS.INVALID,
          validation: {
            issues: [
              {
                severity: 'fatal',
                category: 'technical',
                message:
                  "Invalid meta field 'PROCESSING_TYPE': must be one of: REPROCESSOR_INPUT, REPROCESSOR_OUTPUT, EXPORTER",
                code: 'PROCESSING_TYPE_INVALID',
                context: {
                  location: {
                    sheet: 'Cover',
                    row: 2,
                    column: 'B',
                    field: 'PROCESSING_TYPE'
                  },
                  actual: 'INVALID_TYPE'
                }
              }
            ]
          }
        }
      })
    })
  })

  describe('accreditation number validation', () => {
    it('should validate successfully when registration has accreditation and numbers match', async () => {
      const accreditationNumber = '87654321'

      const { updated } = await runValidation({
        registrationType: 'reprocessor',
        registrationWRN: 'REG-123',
        accreditationNumber,
        metadata: {
          TEMPLATE_VERSION: {
            value: '1.0',
            location: { sheet: 'Cover', row: 1, column: 'B' }
          },
          REGISTRATION_NUMBER: {
            value: 'REG-123',
            location: { sheet: 'Cover', row: 2, column: 'B' }
          },
          PROCESSING_TYPE: {
            value: 'REPROCESSOR_INPUT',
            location: { sheet: 'Cover', row: 3, column: 'B' }
          },
          MATERIAL: {
            value: 'Paper_and_board',
            location: { sheet: 'Cover', row: 4, column: 'B' }
          },
          ACCREDITATION_NUMBER: {
            value: accreditationNumber,
            location: { sheet: 'Cover', row: 5, column: 'B' }
          }
        }
      })

      expect(updated.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      expect(updated.summaryLog.validation.issues).toEqual([])
    })

    it('should fail validation when registration has accreditation but spreadsheet number does not match', async () => {
      const { updated } = await runValidation({
        registrationType: 'reprocessor',
        registrationWRN: 'REG-123',
        accreditationNumber: '87654321',
        metadata: {
          TEMPLATE_VERSION: {
            value: '1.0',
            location: { sheet: 'Cover', row: 1, column: 'B' }
          },
          REGISTRATION_NUMBER: {
            value: 'REG-123',
            location: { sheet: 'Cover', row: 2, column: 'B' }
          },
          PROCESSING_TYPE: {
            value: 'REPROCESSOR_INPUT',
            location: { sheet: 'Cover', row: 3, column: 'B' }
          },
          MATERIAL: {
            value: 'Paper_and_board',
            location: { sheet: 'Cover', row: 4, column: 'B' }
          },
          ACCREDITATION_NUMBER: {
            value: '99999999',
            location: { sheet: 'Cover', row: 5, column: 'B' }
          }
        }
      })

      expect(updated.version).toBe(2)
      expect(updated.summaryLog.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(updated.summaryLog.validation.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'ACCREDITATION_MISMATCH' })
        ])
      )
    })

    it('should fail validation when registration has accreditation but spreadsheet is missing accreditation number', async () => {
      const { updated } = await runValidation({
        registrationType: 'reprocessor',
        registrationWRN: 'REG-123',
        accreditationNumber: '87654321',
        metadata: {
          TEMPLATE_VERSION: {
            value: '1.0',
            location: { sheet: 'Cover', row: 1, column: 'B' }
          },
          REGISTRATION_NUMBER: {
            value: 'REG-123',
            location: { sheet: 'Cover', row: 2, column: 'B' }
          },
          PROCESSING_TYPE: {
            value: 'REPROCESSOR_INPUT',
            location: { sheet: 'Cover', row: 3, column: 'B' }
          },
          MATERIAL: {
            value: 'Paper_and_board',
            location: { sheet: 'Cover', row: 4, column: 'B' }
          }
        }
      })

      expect(updated.version).toBe(2)
      expect(updated.summaryLog.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(updated.summaryLog.validation.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'ACCREDITATION_MISSING' })
        ])
      )
    })

    it('should validate successfully when registration has no accreditation and spreadsheet is blank', async () => {
      const { updated } = await runValidation({
        registrationType: 'exporter',
        registrationWRN: 'REG-456',
        metadata: {
          TEMPLATE_VERSION: {
            value: '1.0',
            location: { sheet: 'Cover', row: 1, column: 'B' }
          },
          REGISTRATION_NUMBER: {
            value: 'REG-456',
            location: { sheet: 'Cover', row: 2, column: 'B' }
          },
          PROCESSING_TYPE: {
            value: 'EXPORTER',
            location: { sheet: 'Cover', row: 3, column: 'B' }
          },
          MATERIAL: {
            value: 'Paper_and_board',
            location: { sheet: 'Cover', row: 4, column: 'B' }
          }
        }
      })

      expect(updated.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      expect(updated.summaryLog.validation.issues).toEqual([])
    })

    it('should fail validation when registration has no accreditation but spreadsheet provides number', async () => {
      const { updated } = await runValidation({
        registrationType: 'exporter',
        registrationWRN: 'REG-456',
        metadata: {
          TEMPLATE_VERSION: {
            value: '1.0',
            location: { sheet: 'Cover', row: 1, column: 'B' }
          },
          REGISTRATION_NUMBER: {
            value: 'REG-456',
            location: { sheet: 'Cover', row: 2, column: 'B' }
          },
          PROCESSING_TYPE: {
            value: 'EXPORTER',
            location: { sheet: 'Cover', row: 3, column: 'B' }
          },
          MATERIAL: {
            value: 'Paper_and_board',
            location: { sheet: 'Cover', row: 4, column: 'B' }
          },
          ACCREDITATION_NUMBER: {
            value: '12345678',
            location: { sheet: 'Cover', row: 5, column: 'B' }
          }
        }
      })

      expect(updated.version).toBe(2)
      expect(updated.summaryLog.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(updated.summaryLog.validation.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'ACCREDITATION_UNEXPECTED' })
        ])
      )
    })
  })
})
