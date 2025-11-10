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
  let validateSummaryLog
  let summaryLogId
  let summaryLog

  beforeEach(async () => {
    summaryLogExtractor = {
      extract: vi.fn().mockResolvedValue({
        meta: {
          REGISTRATION: {
            value: 'WRN12345'
          },
          PROCESSING_TYPE: {
            value: 'REPROCESSOR'
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
        wasteRegistrationNumber: 'WRN12345',
        wasteProcessingType: 'reprocessor',
        material: 'aluminium'
      })
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
      {
        status: SUMMARY_LOG_STATUS.VALIDATED,
        validation: {
          issues: []
        }
      }
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
      {
        status: SUMMARY_LOG_STATUS.INVALID,
        validation: {
          issues: [
            {
              severity: 'fatal',
              category: 'technical',
              message: 'Something went wrong while retrieving your file upload',
              context: {}
            }
          ]
        },
        failureReason: 'Something went wrong while retrieving your file upload'
      }
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
      {
        status: SUMMARY_LOG_STATUS.INVALID,
        validation: {
          issues: [
            {
              severity: 'fatal',
              category: 'technical',
              message: 'Registration with id reg-123 not found',
              context: {}
            }
          ]
        },
        failureReason: 'Registration with id reg-123 not found'
      }
    )
  })

  it('should update status as expected when waste registration number validation fails', async () => {
    summaryLogExtractor.extract.mockResolvedValue({
      meta: {
        REGISTRATION: {
          value: 'WRN99999'
        },
        PROCESSING_TYPE: {
          value: 'REPROCESSOR'
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
      {
        status: SUMMARY_LOG_STATUS.INVALID,
        validation: {
          issues: [
            {
              severity: 'fatal',
              category: 'business',
              message:
                "Summary log's waste registration number does not match this registration",
              context: expect.any(Object)
            }
          ]
        },
        failureReason:
          "Summary log's waste registration number does not match this registration"
      }
    )
  })

  it('should update status as expected when extraction causes an unexpected exception', async () => {
    summaryLogExtractor.extract.mockRejectedValue(new Error('S3 access denied'))

    await validateSummaryLog(summaryLogId)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.INVALID,
        validation: {
          issues: [
            {
              severity: 'fatal',
              category: 'technical',
              message: 'S3 access denied',
              context: {}
            }
          ]
        },
        failureReason: 'S3 access denied'
      }
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
      summaryLogExtractor
    })

    const result = await brokenValidate(summaryLogId).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Database error')

    expect(brokenRepository.update).toHaveBeenCalledTimes(1)
    expect(brokenRepository.update).toHaveBeenCalledWith('summary-log-123', 1, {
      status: SUMMARY_LOG_STATUS.VALIDATED,
      validation: {
        issues: []
      }
    })
  })

  it('should throw database error if repository update fails when marking as invalid', async () => {
    const extractionError = new Error('S3 access denied')
    const databaseError = new Error('Database error')

    summaryLogExtractor.extract.mockRejectedValue(extractionError)
    summaryLogsRepository.update.mockRejectedValue(databaseError)

    const result = await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(result).toBe(databaseError)
  })

  describe('data syntax validation integration', () => {
    it('should pass validation when data syntax is valid', async () => {
      summaryLogExtractor.extract.mockResolvedValue({
        meta: {
          REGISTRATION: { value: 'WRN12345' },
          PROCESSING_TYPE: { value: 'REPROCESSOR' },
          TEMPLATE_VERSION: { value: 1 },
          MATERIAL: { value: 'Aluminium' }
        },
        data: {
          UPDATE_WASTE_BALANCE: {
            location: { sheet: 'Received', row: 7, column: 'B' },
            headers: [
              'OUR_REFERENCE',
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
                10000,
                '2025-05-28T00:00:00.000Z',
                '03 03 08',
                1000,
                100,
                50,
                850,
                true,
                'WEIGHT',
                50,
                0.85,
                850
              ],
              [
                10001,
                '2025-08-01T00:00:00.000Z',
                '16 03 10',
                2000,
                200,
                100,
                1700,
                false,
                'VISUAL',
                100,
                0.9,
                1700
              ]
            ]
          }
        }
      })

      await validateSummaryLog(summaryLogId)

      expect(summaryLogsRepository.update).toHaveBeenCalledWith(
        'summary-log-123',
        1,
        {
          status: SUMMARY_LOG_STATUS.VALIDATED,
          validation: {
            issues: []
          }
        }
      )
    })

    it('should mark as invalid with errors when cell values are invalid (but not fatal)', async () => {
      summaryLogExtractor.extract.mockResolvedValue({
        meta: {
          REGISTRATION: { value: 'WRN12345' },
          PROCESSING_TYPE: { value: 'REPROCESSOR' },
          TEMPLATE_VERSION: { value: 1 },
          MATERIAL: { value: 'Aluminium' }
        },
        data: {
          UPDATE_WASTE_BALANCE: {
            location: { sheet: 'Received', row: 7, column: 'B' },
            headers: [
              'OUR_REFERENCE',
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
                10000,
                '2025-05-28T00:00:00.000Z',
                '03 03 08',
                1000,
                100,
                50,
                850,
                true,
                'WEIGHT',
                50,
                0.85,
                850
              ], // Valid
              [
                9999,
                'invalid-date',
                'bad-code',
                1000,
                100,
                50,
                850,
                true,
                'WEIGHT',
                50,
                0.85,
                850
              ], // Row with 3 invalid cells
              [
                10001,
                '2025-08-01T00:00:00.000Z',
                '16 03 10',
                2000,
                200,
                100,
                1700,
                false,
                'VISUAL',
                100,
                0.9,
                1700
              ] // Valid
            ]
          }
        }
      })

      await validateSummaryLog(summaryLogId)

      expect(summaryLogsRepository.update).toHaveBeenCalledWith(
        'summary-log-123',
        1,
        expect.objectContaining({
          status: SUMMARY_LOG_STATUS.VALIDATED,
          validation: {
            issues: expect.arrayContaining([
              expect.objectContaining({
                severity: 'error',
                category: 'technical',
                message: expect.stringContaining('OUR_REFERENCE')
              }),
              expect.objectContaining({
                severity: 'error',
                category: 'technical',
                message: expect.stringContaining('DATE_RECEIVED')
              }),
              expect.objectContaining({
                severity: 'error',
                category: 'technical',
                message: expect.stringContaining('EWC_CODE')
              })
            ])
          }
        })
      )

      const updateCall = summaryLogsRepository.update.mock.calls[0][2]
      expect(updateCall.validation.issues).toHaveLength(3)
      expect(
        updateCall.validation.issues.every((i) => i.context.row === 2)
      ).toBe(true)
    })

    it('should mark as invalid when required headers are missing (fatal)', async () => {
      summaryLogExtractor.extract.mockResolvedValue({
        meta: {
          REGISTRATION: { value: 'WRN12345' },
          PROCESSING_TYPE: { value: 'REPROCESSOR' },
          TEMPLATE_VERSION: { value: 1 },
          MATERIAL: { value: 'Aluminium' }
        },
        data: {
          UPDATE_WASTE_BALANCE: {
            location: { sheet: 'Received', row: 7, column: 'B' },
            headers: ['OUR_REFERENCE', 'DATE_RECEIVED'], // Missing EWC_CODE
            rows: [[10000, '2025-05-28T00:00:00.000Z']]
          }
        }
      })

      await validateSummaryLog(summaryLogId)

      expect(summaryLogsRepository.update).toHaveBeenCalledWith(
        'summary-log-123',
        1,
        expect.objectContaining({
          status: SUMMARY_LOG_STATUS.INVALID,
          validation: {
            issues: expect.arrayContaining([
              expect.objectContaining({
                severity: 'fatal',
                category: 'technical',
                message:
                  "Missing required header 'EWC_CODE' in table 'UPDATE_WASTE_BALANCE'",
                context: expect.objectContaining({
                  path: 'data.UPDATE_WASTE_BALANCE.headers',
                  field: 'EWC_CODE',
                  expected: 'EWC_CODE'
                })
              })
            ])
          },
          failureReason: expect.stringContaining('Missing required header')
        })
      )
    })

    it('should combine meta syntax and data syntax validation issues', async () => {
      summaryLogExtractor.extract.mockResolvedValue({
        meta: {
          // Missing REGISTRATION (fatal meta error)
          PROCESSING_TYPE: { value: 'REPROCESSOR' },
          TEMPLATE_VERSION: { value: 1 },
          MATERIAL: { value: 'Aluminium' }
        },
        data: {
          UPDATE_WASTE_BALANCE: {
            location: { sheet: 'Received', row: 7, column: 'B' },
            headers: [
              'OUR_REFERENCE',
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
                9999,
                '2025-05-28T00:00:00.000Z',
                'invalid',
                1000,
                100,
                50,
                850,
                true,
                'WEIGHT',
                50,
                0.85,
                850
              ]
            ] // Invalid data
          }
        }
      })

      await validateSummaryLog(summaryLogId)

      const updateCall = summaryLogsRepository.update.mock.calls[0][2]
      expect(updateCall.status).toBe(SUMMARY_LOG_STATUS.INVALID)

      // Should have both meta and data validation issues
      const issues = updateCall.validation.issues
      expect(issues.some((i) => i.message.includes('REGISTRATION'))).toBe(true)
      expect(issues.some((i) => i.message.includes('OUR_REFERENCE'))).toBe(true)
      expect(issues.some((i) => i.message.includes('EWC_CODE'))).toBe(true)

      // Meta error should be fatal
      const metaIssue = issues.find((i) => i.message.includes('REGISTRATION'))
      expect(metaIssue.severity).toBe('fatal')

      // Data errors should be error severity
      const dataIssues = issues.filter(
        (i) =>
          i.message.includes('OUR_REFERENCE') || i.message.includes('EWC_CODE')
      )
      expect(dataIssues.every((i) => i.severity === 'error')).toBe(true)
    })

    it('should validate with tables that have no schema defined (skipped)', async () => {
      summaryLogExtractor.extract.mockResolvedValue({
        meta: {
          REGISTRATION: { value: 'WRN12345' },
          PROCESSING_TYPE: { value: 'REPROCESSOR' },
          TEMPLATE_VERSION: { value: 1 },
          MATERIAL: { value: 'Aluminium' }
        },
        data: {
          UPDATE_WASTE_BALANCE: {
            location: { sheet: 'Received', row: 7, column: 'B' },
            headers: [
              'OUR_REFERENCE',
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
                10000,
                '2025-05-28T00:00:00.000Z',
                '03 03 08',
                1000,
                100,
                50,
                850,
                true,
                'WEIGHT',
                50,
                0.85,
                850
              ]
            ]
          },
          UNKNOWN_TABLE: {
            // No schema defined - should be ignored
            location: { sheet: 'Unknown', row: 1, column: 'A' },
            headers: ['ANYTHING'],
            rows: [['goes']]
          }
        }
      })

      await validateSummaryLog(summaryLogId)

      expect(summaryLogsRepository.update).toHaveBeenCalledWith(
        'summary-log-123',
        1,
        {
          status: SUMMARY_LOG_STATUS.VALIDATED,
          validation: {
            issues: []
          }
        }
      )
    })
  })
})
