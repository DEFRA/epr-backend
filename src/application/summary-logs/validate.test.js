import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import Boom from '@hapi/boom'

import { createSummaryLogsValidator } from './validate.js'
import {
  createEmptyLoadCategory,
  createEmptyLoadValidity
} from './classify-loads.js'

// ============================================================================
// Test Builders
// ============================================================================

const RECEIVED_LOADS_HEADERS = [
  // Waste balance fields (Section 1)
  'ROW_ID',
  'DATE_RECEIVED_FOR_REPROCESSING',
  'EWC_CODE',
  'DESCRIPTION_WASTE',
  'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
  'GROSS_WEIGHT',
  'TARE_WEIGHT',
  'PALLET_WEIGHT',
  'NET_WEIGHT',
  'BAILING_WIRE_PROTOCOL',
  'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
  'WEIGHT_OF_NON_TARGET_MATERIALS',
  'RECYCLABLE_PROPORTION_PERCENTAGE',
  'TONNAGE_RECEIVED_FOR_RECYCLING',
  // Supplementary fields (Sections 2 & 3)
  'SUPPLIER_NAME',
  'SUPPLIER_ADDRESS',
  'SUPPLIER_POSTCODE',
  'SUPPLIER_EMAIL',
  'SUPPLIER_PHONE_NUMBER',
  'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER',
  'YOUR_REFERENCE',
  'WEIGHBRIDGE_TICKET',
  'CARRIER_NAME',
  'CBD_REG_NUMBER',
  'CARRIER_VEHICLE_REGISTRATION_NUMBER'
]

const buildMeta = (overrides = {}) => ({
  REGISTRATION_NUMBER: { value: 'REG12345' },
  PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
  TEMPLATE_VERSION: { value: 5 },
  MATERIAL: { value: 'Aluminium' },
  ...overrides
})

const buildReceivedLoadRow = (overrides = {}) => ({
  // Waste balance fields (Section 1)
  ROW_ID: 10000,
  DATE_RECEIVED_FOR_REPROCESSING: '2025-05-28T00:00:00.000Z',
  EWC_CODE: '03 03 08',
  DESCRIPTION_WASTE: 'Glass - pre-sorted',
  WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
  GROSS_WEIGHT: 1000,
  TARE_WEIGHT: 100,
  PALLET_WEIGHT: 50,
  NET_WEIGHT: 850,
  BAILING_WIRE_PROTOCOL: 'Yes',
  HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Actual weight (100%)',
  WEIGHT_OF_NON_TARGET_MATERIALS: 50,
  RECYCLABLE_PROPORTION_PERCENTAGE: 0.85,
  TONNAGE_RECEIVED_FOR_RECYCLING: 678.98, // (850-50)*0.9985*0.85 with bailing wire
  // Supplementary fields (Sections 2 & 3)
  SUPPLIER_NAME: '',
  SUPPLIER_ADDRESS: '',
  SUPPLIER_POSTCODE: '',
  SUPPLIER_EMAIL: '',
  SUPPLIER_PHONE_NUMBER: '',
  ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: '',
  YOUR_REFERENCE: '',
  WEIGHBRIDGE_TICKET: '',
  CARRIER_NAME: '',
  CBD_REG_NUMBER: '',
  CARRIER_VEHICLE_REGISTRATION_NUMBER: '',
  ...overrides
})

const rowToArray = (rowObject) =>
  RECEIVED_LOADS_HEADERS.map((header) => rowObject[header])

const buildReceivedLoadsTable = ({
  rows = [],
  headers = RECEIVED_LOADS_HEADERS
} = {}) => ({
  location: { sheet: 'Received', row: 7, column: 'B' },
  headers,
  // Row 7 is the header row, so data rows start at row 8
  rows: rows.map((row, index) => ({
    rowNumber: 8 + index,
    values: Array.isArray(row) ? row : rowToArray(row)
  }))
})

const buildExtractedData = ({ meta = {}, data = {} } = {}) => ({
  meta: buildMeta(meta),
  data
})

const buildExistingWasteRecord = (rowData, overrides = {}) => {
  const dataWithProcessingType = {
    ...rowData,
    processingType: 'REPROCESSOR_INPUT'
  }
  return {
    type: 'received',
    rowId: String(rowData.ROW_ID),
    organisationId: 'org-1',
    registrationId: 'reg-1',
    data: dataWithProcessingType,
    versions: [
      {
        createdAt: '2025-01-01T00:00:00.000Z',
        status: 'created',
        summaryLog: {
          id: 'previous-summary-log',
          uri: 's3://bucket/old-key'
        },
        data: dataWithProcessingType
      }
    ],
    ...overrides
  }
}

// ============================================================================

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

const mockRecordStatusTransition = vi.fn()
const mockRecordValidationDuration = vi.fn()
const mockRecordValidationIssues = vi.fn()
const mockRecordRowOutcome = vi.fn()

vi.mock('#common/helpers/metrics/summary-logs.js', () => ({
  summaryLogMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args),
    recordValidationDuration: (...args) =>
      mockRecordValidationDuration(...args),
    recordValidationIssues: (...args) => mockRecordValidationIssues(...args),
    recordRowOutcome: (...args) => mockRecordRowOutcome(...args)
  }
}))

describe('SummaryLogsValidator', () => {
  let summaryLogExtractor
  let summaryLogsRepository
  let organisationsRepository
  let wasteRecordsRepository
  let validateSummaryLog
  let summaryLogId
  let summaryLog

  beforeEach(async () => {
    summaryLogExtractor = {
      extract: vi.fn().mockResolvedValue({
        meta: {
          REGISTRATION_NUMBER: {
            value: 'REG12345'
          },
          PROCESSING_TYPE: {
            value: 'REPROCESSOR_INPUT'
          },
          TEMPLATE_VERSION: {
            value: 5
          },
          MATERIAL: {
            value: 'Aluminium'
          }
        },
        data: {}
      })
    }

    organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        id: 'reg-123',
        registrationNumber: 'REG12345',
        wasteProcessingType: 'reprocessor',
        reprocessingType: 'input',
        material: 'aluminium'
      })
    }

    wasteRecordsRepository = {
      findByRegistration: vi.fn().mockResolvedValue([])
    }

    summaryLogId = 'summary-log-123'

    summaryLog = {
      status: SUMMARY_LOG_STATUS.VALIDATING,
      organisationId: 'org-123',
      registrationId: 'reg-123',
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

    /** @type {any} */
    summaryLogsRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn()
    }

    validateSummaryLog = createSummaryLogsValidator({
      summaryLogsRepository: /** @type {any} */ (summaryLogsRepository),
      organisationsRepository: /** @type {any} */ (organisationsRepository),
      wasteRecordsRepository: /** @type {any} */ (wasteRecordsRepository),
      summaryLogExtractor
    })
  })

  afterEach(() => {
    mockRecordStatusTransition.mockClear()
    mockRecordValidationDuration.mockClear()
    mockRecordValidationIssues.mockClear()
    mockRecordRowOutcome.mockClear()
    vi.resetAllMocks()
  })

  it('should throw error if summary log is not found', async () => {
    summaryLogsRepository.findById.mockResolvedValue(null)

    const result = await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe(
      'Summary log not found: summaryLogId=summary-log-123'
    )
  })

  it('should log as expected when validation starts', async () => {
    await validateSummaryLog(summaryLogId)

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

  it('should log as expected when extraction succeeds', async () => {
    await validateSummaryLog(summaryLogId)

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Extracted summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_success'
        })
      })
    )
  })

  it('should update status as expected when validation succeeds', async () => {
    await validateSummaryLog(summaryLogId)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      expect.objectContaining({
        status: SUMMARY_LOG_STATUS.VALIDATED,
        validation: expect.objectContaining({
          issues: []
        })
      })
    )
  })

  it('should persist extracted meta when validation succeeds', async () => {
    await validateSummaryLog(summaryLogId)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      expect.objectContaining({
        meta: {
          REGISTRATION_NUMBER: 'REG12345',
          PROCESSING_TYPE: 'REPROCESSOR_INPUT',
          TEMPLATE_VERSION: 5,
          MATERIAL: 'Aluminium'
        }
      })
    )
  })

  it('should persist ACCREDITATION_NUMBER from spreadsheet when present', async () => {
    organisationsRepository.findRegistrationById.mockResolvedValue({
      id: 'reg-123',
      registrationNumber: 'REG12345',
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'input',
      material: 'aluminium',
      accreditation: {
        accreditationNumber: 'ACC12345'
      }
    })

    summaryLogExtractor.extract.mockResolvedValue(
      buildExtractedData({
        meta: { ACCREDITATION_NUMBER: { value: 'ACC12345' } }
      })
    )

    await validateSummaryLog(summaryLogId)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      expect.objectContaining({
        meta: {
          REGISTRATION_NUMBER: 'REG12345',
          PROCESSING_TYPE: 'REPROCESSOR_INPUT',
          TEMPLATE_VERSION: 5,
          MATERIAL: 'Aluminium',
          ACCREDITATION_NUMBER: 'ACC12345'
        }
      })
    )
  })

  it('should persist extracted meta even when meta business validation fails', async () => {
    summaryLogExtractor.extract.mockResolvedValue(
      buildExtractedData({
        meta: { REGISTRATION_NUMBER: { value: 'REG99999' } } // Wrong - fatal business error
      })
    )

    await validateSummaryLog(summaryLogId)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      expect.objectContaining({
        status: SUMMARY_LOG_STATUS.INVALID,
        meta: {
          REGISTRATION_NUMBER: 'REG99999',
          PROCESSING_TYPE: 'REPROCESSOR_INPUT',
          TEMPLATE_VERSION: 5,
          MATERIAL: 'Aluminium'
        }
      })
    )
  })

  it('should update status as expected when extraction fails', async () => {
    summaryLogExtractor.extract.mockRejectedValue(
      new Error('Something went wrong while retrieving your file upload')
    )

    await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      expect.objectContaining({
        status: SUMMARY_LOG_STATUS.INVALID,
        validation: expect.objectContaining({
          issues: [
            {
              severity: 'fatal',
              category: 'technical',
              message: 'Something went wrong while retrieving your file upload',
              code: 'VALIDATION_SYSTEM_ERROR'
            }
          ]
        })
      })
    )
  })

  it('should update status as expected when registration not found', async () => {
    organisationsRepository.findRegistrationById.mockRejectedValue(
      Boom.notFound('Registration with id reg-123 not found')
    )

    await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      expect.objectContaining({
        status: SUMMARY_LOG_STATUS.INVALID,
        validation: expect.objectContaining({
          issues: [
            {
              severity: 'fatal',
              category: 'technical',
              message: 'Registration with id reg-123 not found',
              code: 'VALIDATION_SYSTEM_ERROR'
            }
          ]
        })
      })
    )
  })

  it('should update status as expected when waste registration number validation fails', async () => {
    summaryLogExtractor.extract.mockResolvedValue(
      buildExtractedData({
        meta: { REGISTRATION_NUMBER: { value: 'REG99999' } }
      })
    )

    await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      expect.objectContaining({
        status: SUMMARY_LOG_STATUS.INVALID,
        validation: expect.objectContaining({
          issues: [
            {
              severity: 'fatal',
              category: 'business',
              message:
                "Summary log's registration number does not match this registration",
              code: 'REGISTRATION_MISMATCH',
              context: {
                location: { field: 'REGISTRATION_NUMBER' },
                expected: 'REG12345',
                actual: 'REG99999'
              }
            }
          ]
        })
      })
    )
  })

  it('should update status as expected when extraction causes an unexpected exception', async () => {
    summaryLogExtractor.extract.mockRejectedValue(new Error('S3 access denied'))

    await validateSummaryLog(summaryLogId)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      expect.objectContaining({
        status: SUMMARY_LOG_STATUS.INVALID,
        validation: expect.objectContaining({
          issues: [
            {
              severity: 'fatal',
              category: 'technical',
              message: 'S3 access denied',
              code: 'VALIDATION_SYSTEM_ERROR'
            }
          ]
        })
      })
    )
  })

  it('should return SPREADSHEET_STRUCTURE_INVALID code when spreadsheet validation fails', async () => {
    const { SpreadsheetValidationError } =
      await import('#adapters/parsers/summary-logs/exceljs-parser.js')
    summaryLogExtractor.extract.mockRejectedValue(
      new SpreadsheetValidationError("Missing required 'Cover' worksheet")
    )

    await validateSummaryLog(summaryLogId)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      expect.objectContaining({
        status: SUMMARY_LOG_STATUS.INVALID,
        validation: expect.objectContaining({
          issues: [
            {
              severity: 'fatal',
              category: 'technical',
              message: "Missing required 'Cover' worksheet",
              code: 'SPREADSHEET_INVALID_ERROR'
            }
          ]
        })
      })
    )
  })

  it('should log as expected when validation fails', async () => {
    summaryLogExtractor.extract.mockRejectedValue(new Error('S3 access denied'))

    await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Failed to validate summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_failure'
        })
      })
    )
  })

  it('should log as expected once status updated', async () => {
    await validateSummaryLog(summaryLogId)

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

  it('should throw error if repository update fails during success handler without marking as invalid', async () => {
    /** @type {any} */
    const brokenRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn().mockRejectedValue(new Error('Database error'))
    }

    const brokenValidate = createSummaryLogsValidator({
      summaryLogsRepository: brokenRepository,
      organisationsRepository: /** @type {any} */ (organisationsRepository),
      wasteRecordsRepository: /** @type {any} */ (wasteRecordsRepository),
      summaryLogExtractor
    })

    const result = await brokenValidate(summaryLogId).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Database error')

    expect(brokenRepository.update).toHaveBeenCalledTimes(1)
    expect(brokenRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      expect.objectContaining({
        status: SUMMARY_LOG_STATUS.VALIDATED,
        validation: expect.objectContaining({
          issues: []
        })
      })
    )
  })

  it('should throw database error if repository update fails when marking as invalid', async () => {
    const extractionError = new Error('S3 access denied')
    const databaseError = new Error('Database error')

    summaryLogExtractor.extract.mockRejectedValue(extractionError)
    summaryLogsRepository.update.mockRejectedValue(databaseError)

    const result = await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(result).toBe(databaseError)
  })

  describe('Four-level validation hierarchy short-circuit behavior', () => {
    it('Level 1 fatal (meta syntax) stops Level 2 (meta business) from running', async () => {
      // Meta syntax error: missing TEMPLATE_VERSION
      summaryLogExtractor.extract.mockResolvedValue(
        buildExtractedData({
          meta: { TEMPLATE_VERSION: undefined } // Missing - fatal syntax error
        })
      )

      await validateSummaryLog(summaryLogId)

      // Should NOT fetch registration (Level 2 meta business validation skipped)
      expect(
        organisationsRepository.findRegistrationById
      ).not.toHaveBeenCalled()

      // Should have meta syntax error only
      expect(summaryLogsRepository.update).toHaveBeenCalledWith(
        'summary-log-123',
        1,
        expect.objectContaining({
          status: SUMMARY_LOG_STATUS.INVALID,
          validation: expect.objectContaining({
            issues: expect.arrayContaining([
              expect.objectContaining({
                severity: 'fatal',
                category: 'technical',
                message: expect.stringContaining('TEMPLATE_VERSION')
              })
            ])
          })
        })
      )
    })

    it('Level 2 fatal (meta business) stops Level 3 (data syntax) from running', async () => {
      // Meta business error: registration mismatch
      // Data syntax error: invalid data table structure that should NOT be validated
      summaryLogExtractor.extract.mockResolvedValue(
        buildExtractedData({
          meta: { REGISTRATION_NUMBER: { value: 'REG99999' } }, // Wrong - fatal business error
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: buildReceivedLoadsTable({
              headers: ['INVALID_HEADER'], // Should NOT be validated
              rows: [[123]]
            })
          }
        })
      )

      await validateSummaryLog(summaryLogId)

      const updateCall = summaryLogsRepository.update.mock.calls[0][2]

      // Should only have meta business error, no data syntax errors
      expect(updateCall.validation.issues).toHaveLength(1)
      expect(updateCall.validation.issues[0]).toMatchObject({
        severity: 'fatal',
        category: 'business',
        message: expect.stringContaining('registration number')
      })

      // Verify no data syntax errors present
      const hasDataSyntaxErrors = updateCall.validation.issues.some(
        (issue) => issue.context?.location?.header !== undefined
      )
      expect(hasDataSyntaxErrors).toBe(false)
    })

    it('Level 1 and Level 2 pass, Level 3 (data syntax) runs and finds fatal errors', async () => {
      // Valid meta, but invalid data (row-level errors, fatal since EWC_CODE is in fatalFields)
      summaryLogExtractor.extract.mockResolvedValue(
        buildExtractedData({
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: buildReceivedLoadsTable({
              rows: [
                buildReceivedLoadRow({
                  EWC_CODE: 'bad-code' // Fatal row error (EWC_CODE is in fatalFields)
                })
              ]
            })
          }
        })
      )

      await validateSummaryLog(summaryLogId)

      const updateCall = summaryLogsRepository.update.mock.calls[0][2]

      // Should fetch registration (Level 2 ran)
      expect(organisationsRepository.findRegistrationById).toHaveBeenCalled()

      // Should have data syntax errors
      expect(updateCall.validation.issues.length).toBeGreaterThan(0)

      // Should be INVALID (EWC_CODE validation errors are fatal)
      expect(updateCall.status).toBe(SUMMARY_LOG_STATUS.INVALID)
    })

    it('Level 3 fatal (missing required header) stops Level 4 (transform/data business) from running', async () => {
      // Valid meta, but missing required header in data table (fatal)
      summaryLogExtractor.extract.mockResolvedValue(
        buildExtractedData({
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: buildReceivedLoadsTable({
              headers: ['ROW_ID'], // Missing required headers - fatal
              rows: [[10001]]
            })
          }
        })
      )

      await validateSummaryLog(summaryLogId)

      const updateCall = summaryLogsRepository.update.mock.calls[0][2]

      // Should be INVALID (missing required header is fatal)
      expect(updateCall.status).toBe(SUMMARY_LOG_STATUS.INVALID)

      // Should have fatal error about missing header
      expect(updateCall.validation.issues).toContainEqual(
        expect.objectContaining({
          severity: 'fatal',
          code: 'HEADER_REQUIRED'
        })
      )

      // Should NOT fetch existing waste records (Level 4 transform didn't run)
      expect(wasteRecordsRepository.findByRegistration).not.toHaveBeenCalled()
    })
  })

  describe('Load classification', () => {
    it('stores loads with rowIds when validation passes with data rows', async () => {
      summaryLogExtractor.extract.mockResolvedValue(
        buildExtractedData({
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: buildReceivedLoadsTable({
              rows: [
                buildReceivedLoadRow(), // Valid row (ROW_ID: 10000) - included
                buildReceivedLoadRow({
                  ROW_ID: 10001, // Valid ROW_ID
                  EWC_CODE: null // Missing required field - excluded from waste balance
                })
              ]
            })
          }
        })
      )

      await validateSummaryLog(summaryLogId)

      const updateCall = summaryLogsRepository.update.mock.calls[0][2]

      // Note: ROW_ID values come directly from test data as numbers
      // Row 10001 is excluded because EWC_CODE is missing (fieldsRequiredForWasteBalance)
      expect(updateCall.loads).toEqual({
        added: {
          valid: { count: 1, rowIds: [10000] },
          invalid: { count: 1, rowIds: [10001] },
          included: { count: 1, rowIds: [10000] },
          excluded: { count: 1, rowIds: [10001] }
        },
        unchanged: createEmptyLoadValidity(),
        adjusted: createEmptyLoadValidity()
      })
    })

    it('does not store loads when validation fails with fatal error', async () => {
      summaryLogExtractor.extract.mockResolvedValue(
        buildExtractedData({
          meta: { REGISTRATION_NUMBER: { value: 'REG99999' } } // Wrong - fatal error
        })
      )

      await validateSummaryLog(summaryLogId)

      const updateCall = summaryLogsRepository.update.mock.calls[0][2]

      expect(updateCall.loads).toBeUndefined()
      expect(updateCall.status).toBe(SUMMARY_LOG_STATUS.INVALID)
    })

    it('classifies existing records as unchanged when data has not changed', async () => {
      // Same row data used for both existing record and new upload
      const rowData = buildReceivedLoadRow()

      wasteRecordsRepository.findByRegistration.mockResolvedValue([
        buildExistingWasteRecord(rowData)
      ])

      summaryLogExtractor.extract.mockResolvedValue(
        buildExtractedData({
          data: {
            RECEIVED_LOADS_FOR_REPROCESSING: buildReceivedLoadsTable({
              rows: [rowData]
            })
          }
        })
      )

      await validateSummaryLog(summaryLogId)

      const updateCall = summaryLogsRepository.update.mock.calls[0][2]

      // Note: ROW_ID for unchanged comes from existing record (string)
      expect(updateCall.loads).toEqual({
        added: createEmptyLoadValidity(),
        unchanged: {
          valid: { count: 1, rowIds: ['10000'] },
          invalid: createEmptyLoadCategory(),
          included: { count: 1, rowIds: ['10000'] },
          excluded: createEmptyLoadCategory()
        },
        adjusted: createEmptyLoadValidity()
      })

      // Reset the mock for other tests
      wasteRecordsRepository.findByRegistration.mockResolvedValue([])
    })
  })

  describe('metrics', () => {
    it('should record VALIDATED status transition metric when validation succeeds', async () => {
      await validateSummaryLog(summaryLogId)

      expect(mockRecordStatusTransition).toHaveBeenCalledWith({
        status: SUMMARY_LOG_STATUS.VALIDATED,
        processingType: 'REPROCESSOR_INPUT'
      })
    })

    it('should record INVALID status transition metric when validation fails', async () => {
      summaryLogExtractor.extract.mockResolvedValue(
        buildExtractedData({
          meta: { REGISTRATION_NUMBER: { value: 'REG99999' } } // Wrong - fatal business error
        })
      )

      await validateSummaryLog(summaryLogId)

      expect(mockRecordStatusTransition).toHaveBeenCalledWith({
        status: SUMMARY_LOG_STATUS.INVALID,
        processingType: 'REPROCESSOR_INPUT'
      })
    })

    it('should record validation duration metric', async () => {
      await validateSummaryLog(summaryLogId)

      expect(mockRecordValidationDuration).toHaveBeenCalledWith(
        { processingType: 'REPROCESSOR_INPUT' },
        expect.any(Number)
      )
    })
  })
})
