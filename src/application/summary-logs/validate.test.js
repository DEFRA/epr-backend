import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import Boom from '@hapi/boom'

import { createSummaryLogsValidator } from './validate.js'

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
            value: 1
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

    summaryLogsRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn()
    }

    validateSummaryLog = createSummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      wasteRecordsRepository,
      summaryLogExtractor
    })
  })

  afterEach(() => {
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
        }),
        failureReason: 'Something went wrong while retrieving your file upload'
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
        }),
        failureReason: 'Registration with id reg-123 not found'
      })
    )
  })

  it('should update status as expected when waste registration number validation fails', async () => {
    summaryLogExtractor.extract.mockResolvedValue({
      meta: {
        REGISTRATION_NUMBER: {
          value: 'REG99999'
        },
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT'
        },
        TEMPLATE_VERSION: {
          value: 1
        },
        MATERIAL: {
          value: 'Aluminium'
        }
      },
      data: {}
    })

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
        }),
        failureReason:
          "Summary log's registration number does not match this registration"
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
        }),
        failureReason: 'S3 access denied'
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
    const brokenRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn().mockRejectedValue(new Error('Database error'))
    }

    const brokenValidate = createSummaryLogsValidator({
      summaryLogsRepository: brokenRepository,
      organisationsRepository,
      wasteRecordsRepository,
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
      summaryLogExtractor.extract.mockResolvedValue({
        meta: {
          REGISTRATION_NUMBER: { value: 'REG12345' },
          PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
          MATERIAL: { value: 'Aluminium' }
          // TEMPLATE_VERSION missing - fatal syntax error
        },
        data: {}
      })

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
          }),
          failureReason: expect.stringContaining('TEMPLATE_VERSION')
        })
      )
    })

    it('Level 2 fatal (meta business) stops Level 3 (data syntax) from running', async () => {
      // Meta business error: registration mismatch
      // Data syntax error: invalid data table structure that should NOT be validated
      summaryLogExtractor.extract.mockResolvedValue({
        meta: {
          REGISTRATION_NUMBER: { value: 'REG99999' }, // Wrong registration - fatal business error
          PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
          TEMPLATE_VERSION: { value: 1 },
          MATERIAL: { value: 'Aluminium' }
        },
        data: {
          RECEIVED_LOADS_FOR_REPROCESSING: {
            location: { sheet: 'Received', row: 7, column: 'B' },
            headers: ['INVALID_HEADER'], // This should NOT be validated
            rows: [[123]] // Invalid data that should NOT be validated
          }
        }
      })

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

    it('Level 1 and Level 2 pass, Level 3 (data syntax) runs and finds errors', async () => {
      // Valid meta, but invalid data (row-level errors, not fatal)
      summaryLogExtractor.extract.mockResolvedValue({
        meta: {
          REGISTRATION_NUMBER: { value: 'REG12345' },
          PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
          TEMPLATE_VERSION: { value: 1 },
          MATERIAL: { value: 'Aluminium' }
        },
        data: {
          RECEIVED_LOADS_FOR_REPROCESSING: {
            location: { sheet: 'Received', row: 7, column: 'B' },
            headers: [
              'ROW_ID',
              'DATE_RECEIVED',
              'EWC_CODE',
              'GROSS_WEIGHT',
              'TARE_WEIGHT',
              'PALLET_WEIGHT',
              'NET_WEIGHT',
              'BAILING_WIRE',
              'HOW_CALCULATE_RECYCLABLE',
              'WEIGHT_OF_NON_TARGET',
              'RECYCLABLE_PROPORTION',
              'TONNAGE_RECEIVED_FOR_EXPORT'
            ],
            rows: [
              [
                9999, // Below minimum ROW_ID - non-fatal error
                '2025-05-28T00:00:00.000Z',
                '03 03 08',
                1000,
                100,
                50,
                850,
                'YES',
                'WEIGHT',
                50,
                0.85,
                850
              ]
            ]
          }
        }
      })

      await validateSummaryLog(summaryLogId)

      const updateCall = summaryLogsRepository.update.mock.calls[0][2]

      // Should fetch registration (Level 2 ran)
      expect(organisationsRepository.findRegistrationById).toHaveBeenCalled()

      // Should have data syntax errors
      expect(updateCall.validation.issues.length).toBeGreaterThan(0)

      // Should be VALIDATED (data syntax errors are not fatal)
      expect(updateCall.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })
  })
})
