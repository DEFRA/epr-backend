import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'

import {
  createSummaryLogsValidator,
  fetchRegistration,
  validateWasteRegistrationNumber,
  validateSummaryLogType,
  validateSummaryLogMaterialType
} from './validator.js'

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
  let summaryLogUpdater
  let summaryLogsRepository
  let organisationsRepository
  let validateSummaryLog
  let summaryLogId
  let summaryLog

  beforeEach(async () => {
    summaryLogExtractor = {
      extract: vi.fn().mockResolvedValue({
        meta: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN12345'
          },
          SUMMARY_LOG_TYPE: {
            value: 'REPROCESSOR'
          },
          MATERIAL: {
            value: 'Aluminium'
          }
        },
        data: {}
      })
    }

    summaryLogUpdater = {
      update: vi.fn().mockResolvedValue(undefined)
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
      summaryLogExtractor,
      summaryLogUpdater
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

    expect(summaryLogUpdater.update).toHaveBeenCalledWith({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED
    })
  })

  it('should update status as expected when validation succeeds if existing record indicated failure', async () => {
    summaryLog.failureReason = 'Existing error'

    await validateSummaryLog(summaryLogId)

    expect(summaryLogUpdater.update).toHaveBeenCalledWith({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED
    })
  })

  it('should update status as expected when extraction fails', async () => {
    summaryLogExtractor.extract.mockRejectedValue(
      new Error('Something went wrong while retrieving your file upload')
    )

    await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(summaryLogUpdater.update).toHaveBeenCalledWith({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: 'Something went wrong while retrieving your file upload'
    })
  })

  it('should update status as expected when registration not found', async () => {
    organisationsRepository.findRegistrationById.mockResolvedValue(null)

    await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(summaryLogUpdater.update).toHaveBeenCalledWith({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason:
        'Registration not found: organisationId=org-123, registrationId=reg-123'
    })
  })

  it('should update status as expected when waste registration number validation fails', async () => {
    summaryLogExtractor.extract.mockResolvedValue({
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN99999'
        }
      },
      data: {}
    })

    await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(summaryLogUpdater.update).toHaveBeenCalledWith({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason:
        "Summary log's waste registration number does not match this registration"
    })
  })

  it('should update status as expected when extraction causes an unexpected exception', async () => {
    summaryLogExtractor.extract.mockRejectedValue(new Error('S3 access denied'))

    const result = await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('S3 access denied')

    expect(summaryLogUpdater.update).toHaveBeenCalledWith({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: 'S3 access denied'
    })
  })

  it('should log as expected when extraction fails', async () => {
    summaryLogExtractor.extract.mockRejectedValue(new Error('S3 access denied'))

    await validateSummaryLog(summaryLogId).catch((err) => err)

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Failed to extract summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx',
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

  it('should throw error if repository update fails', async () => {
    const brokenUpdater = {
      update: vi.fn().mockRejectedValue(new Error('Database error'))
    }

    const brokenValidate = createSummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor,
      summaryLogUpdater: brokenUpdater
    })

    const result = await brokenValidate(summaryLogId).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Database error')
  })
})

describe('fetchRegistration', () => {
  it('returns registration when found', async () => {
    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        id: 'reg-123',
        wasteRegistrationNumber: 'WRN12345'
      })
    }

    const result = await fetchRegistration({
      organisationsRepository: mockOrganisationsRepository,
      organisationId: 'org-123',
      registrationId: 'reg-123',
      loggingContext: 'test-context'
    })

    expect(result).toBeDefined()
    expect(result.id).toBe('reg-123')
    expect(result.wasteRegistrationNumber).toBe('WRN12345')
  })

  it('throws error when registration not found', async () => {
    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue(null)
    }

    await expect(
      fetchRegistration({
        organisationsRepository: mockOrganisationsRepository,
        organisationId: 'org-123',
        registrationId: 'reg-123',
        loggingContext: 'test-context'
      })
    ).rejects.toThrow(
      'Registration not found: organisationId=org-123, registrationId=reg-123'
    )
  })
})

describe('validateWasteRegistrationNumber', () => {
  it('throws error when registration has no wasteRegistrationNumber', () => {
    const registration = {
      id: 'reg-123'
    }
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN12345'
        }
      }
    }

    expect(() =>
      validateWasteRegistrationNumber({
        parsed,
        registration,
        msg: 'test-msg'
      })
    ).toThrow(
      'Invalid summary log: registration has no waste registration number'
    )
  })

  it('throws error when spreadsheet missing registration number', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {}
    }

    expect(() =>
      validateWasteRegistrationNumber({
        parsed,
        registration,
        msg: 'test-msg'
      })
    ).toThrow('Invalid summary log: missing registration number')
  })

  it('throws error when spreadsheet registration number value is undefined', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: undefined
        }
      }
    }

    expect(() =>
      validateWasteRegistrationNumber({
        parsed,
        registration,
        msg: 'test-msg'
      })
    ).toThrow('Invalid summary log: missing registration number')
  })

  it('throws error when registration numbers do not match', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN99999'
        }
      }
    }

    expect(() =>
      validateWasteRegistrationNumber({
        parsed,
        registration,
        msg: 'test-msg'
      })
    ).toThrow(
      "Summary log's waste registration number does not match this registration"
    )
  })

  it('does not throw when registration numbers match', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: {
          value: 'WRN12345'
        }
      }
    }

    expect(() =>
      validateWasteRegistrationNumber({
        parsed,
        registration,
        msg: 'test-msg'
      })
    ).not.toThrow()
  })
})

describe('validateSummaryLogType', () => {
  it('should throw error when SUMMARY_LOG_TYPE is missing', () => {
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' }
      }
    }
    const registration = {
      wasteProcessingType: 'reprocessor'
    }

    expect(() =>
      validateSummaryLogType({ parsed, registration, loggingContext: 'test' })
    ).toThrow('Invalid summary log: missing summary log type')
  })

  it('should log error and throw when registration has unexpected type', () => {
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' },
        SUMMARY_LOG_TYPE: { value: 'REPROCESSOR' }
      }
    }
    const registration = {
      wasteProcessingType: 'invalid-unexpected-type'
    }

    expect(() =>
      validateSummaryLogType({ parsed, registration, loggingContext: 'test' })
    ).toThrow('Summary log type does not match registration type')

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Unexpected registration type: test, wasteProcessingType=invalid-unexpected-type',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_failure'
        })
      })
    )
  })
})

describe('validateSummaryLogMaterialType', () => {
  it('should throw error when MATERIAL is missing', () => {
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' }
      }
    }
    const registration = {
      material: 'aluminium'
    }

    expect(() =>
      validateSummaryLogMaterialType({
        parsed,
        registration,
        loggingContext: 'test'
      })
    ).toThrow('Invalid summary log: missing material')
  })

  it('should log error and throw when registration has unexpected material', () => {
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' },
        MATERIAL: { value: 'Aluminium' }
      }
    }
    const registration = {
      material: 'invalid-unexpected-material'
    }

    expect(() =>
      validateSummaryLogMaterialType({
        parsed,
        registration,
        loggingContext: 'test'
      })
    ).toThrow('Material does not match registration material')

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Unexpected registration material: test, material=invalid-unexpected-material',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_failure'
        })
      })
    )
  })

  it('should throw error when material type does not match', () => {
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' },
        MATERIAL: { value: 'Aluminium' }
      }
    }
    const registration = {
      material: 'plastic'
    }

    expect(() =>
      validateSummaryLogMaterialType({
        parsed,
        registration,
        loggingContext: 'test'
      })
    ).toThrow('Material does not match registration material')
  })

  it('should validate successfully when material types match', () => {
    const parsed = {
      meta: {
        WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' },
        MATERIAL: { value: 'Aluminium' }
      }
    }
    const registration = {
      material: 'aluminium'
    }

    expect(() =>
      validateSummaryLogMaterialType({
        parsed,
        registration,
        loggingContext: 'test'
      })
    ).not.toThrow()

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Validated material: test, spreadsheetMaterial=Aluminium, registrationMaterial=aluminium'
      })
    )
  })
})
