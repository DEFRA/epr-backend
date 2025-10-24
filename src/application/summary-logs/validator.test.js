import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'

import {
  summaryLogsValidator,
  fetchRegistration,
  validateWasteRegistrationNumber
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

describe('summaryLogsValidator', () => {
  let uploadsRepository
  let summaryLogsParser
  let summaryLogsRepository
  let organisationsRepository
  let summaryLogId
  let summaryLog

  beforeEach(async () => {
    uploadsRepository = {
      findByLocation: vi
        .fn()
        .mockResolvedValue(Buffer.from('mock file content'))
    }

    summaryLogsParser = {
      parse: vi.fn().mockResolvedValue({
        meta: {
          REGISTRATION_NUMBER: {
            value: 'REG-TEST-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          },
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-TEST-123'
          }
        },
        data: {}
      })
    }

    organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        id: 'REG-TEST-123',
        wasteRegistrationNumber: 'WRN-TEST-123'
      })
    }

    summaryLogId = 'summary-log-123'

    summaryLog = {
      status: SUMMARY_LOG_STATUS.VALIDATING,
      organisationId: 'org-123',
      registrationId: 'REG-TEST-123',
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
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should find summary log by id', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    })

    expect(summaryLogsRepository.findById).toHaveBeenCalledWith(
      'summary-log-123'
    )
  })

  it('should throw error if summary log is not found', async () => {
    summaryLogsRepository.findById.mockResolvedValue(null)

    const result = await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    }).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe(
      'Summary log not found: summaryLogId=summary-log-123'
    )
  })

  it('should log as expected when validation worker starts', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    })

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

  it('should fetch file from uploads repository', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    })

    expect(uploadsRepository.findByLocation).toHaveBeenCalledWith({
      bucket: 'test-bucket',
      key: 'test-key'
    })
  })

  it('should log as expected when file fetched successfully', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    })

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Fetched summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx, s3Path=test-bucket/test-key',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_success'
        })
      })
    )
  })

  it('should log as expected when file not fetched successfully', async () => {
    uploadsRepository.findByLocation.mockResolvedValue(null)

    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    }).catch((err) => err)

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Failed to fetch summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx, s3Path=test-bucket/test-key',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_failure'
        })
      })
    )
  })

  it('should update status as expected when file is fetched successfully', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    })

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.VALIDATED
      }
    )
  })

  it('should update status as expected when file is fetched successfully if existing record indicated failure', async () => {
    summaryLog.failureReason = 'Existing error'

    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    })

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.VALIDATED,
        failureReason: null
      }
    )
  })

  it('should update status as expected when file is not fetched successfully', async () => {
    uploadsRepository.findByLocation.mockResolvedValue(null)

    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    }).catch((err) => err)

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'Something went wrong while retrieving your file upload'
      }
    )
  })

  it('should update status as expected when attempt to fetch file causes an unexpected exception', async () => {
    uploadsRepository.findByLocation.mockRejectedValue(
      new Error('S3 access denied')
    )

    const result = await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    }).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('S3 access denied')

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'S3 access denied'
      }
    )
  })

  it('should log as expected when attempt to fetch file causes an unexpected exception', async () => {
    uploadsRepository.findByLocation.mockRejectedValue(
      new Error('S3 access denied')
    )

    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    }).catch((err) => err)

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Failed to process summary log file: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx',
        event: expect.objectContaining({
          category: 'server',
          action: 'process_failure'
        })
      })
    )
  })

  it('should log as expected once status updated', async () => {
    await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository,
      summaryLogsParser,
      organisationsRepository,
      summaryLogId
    })

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
    const brokenRepository = {
      ...summaryLogsRepository,
      update: vi.fn().mockRejectedValue(new Error('Database error'))
    }

    const result = await summaryLogsValidator({
      uploadsRepository,
      summaryLogsRepository: brokenRepository,
      summaryLogsParser,
      summaryLogId
    }).catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Database error')
  })

  it('sets status to INVALID when registration number is missing', async () => {
    const summaryLogId = 'test-summary-log-id'
    const fileId = 'test-file-id'
    const filename = 'test.xlsx'
    const organisationId = 'org-123'
    const registrationId = 'REG12345'

    const summaryLog = {
      file: {
        id: fileId,
        name: filename,
        s3: {
          bucket: 'test-bucket',
          key: 'test-key'
        }
      },
      organisationId,
      registrationId
    }

    const mockUploadsRepository = {
      findByLocation: vi.fn().mockResolvedValue(Buffer.from('test'))
    }

    const mockSummaryLogsRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn().mockResolvedValue()
    }

    const mockSummaryLogsParser = {
      parse: vi.fn().mockResolvedValue({
        meta: {}, // Missing REGISTRATION_NUMBER
        data: {}
      })
    }

    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        id: registrationId,
        wasteRegistrationNumber: 'WRN12345'
      })
    }

    await expect(
      summaryLogsValidator({
        uploadsRepository: mockUploadsRepository,
        summaryLogsRepository: mockSummaryLogsRepository,
        summaryLogsParser: mockSummaryLogsParser,
        organisationsRepository: mockOrganisationsRepository,
        summaryLogId
      })
    ).rejects.toThrow('Invalid summary log: missing registration number')

    expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
      summaryLogId,
      1,
      {
        status: 'invalid',
        failureReason: 'Invalid summary log: missing registration number'
      }
    )
  })

  it('sets status to INVALID when registration not found', async () => {
    const summaryLogId = 'test-summary-log-id'
    const organisationId = 'org-123'
    const registrationId = 'reg-456'

    const summaryLog = {
      file: {
        id: 'file-id',
        name: 'test.xlsx',
        s3: { bucket: 'test-bucket', key: 'test-key' }
      },
      organisationId,
      registrationId
    }

    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue(null)
    }

    const mockUploadsRepository = {
      findByLocation: vi.fn().mockResolvedValue(Buffer.from('test'))
    }

    const mockSummaryLogsRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn().mockResolvedValue()
    }

    const mockSummaryLogsParser = {
      parse: vi.fn().mockResolvedValue({
        meta: {
          REGISTRATION_NUMBER: { value: 'reg-456' },
          WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' }
        },
        data: {}
      })
    }

    await expect(
      summaryLogsValidator({
        uploadsRepository: mockUploadsRepository,
        summaryLogsRepository: mockSummaryLogsRepository,
        summaryLogsParser: mockSummaryLogsParser,
        organisationsRepository: mockOrganisationsRepository,
        summaryLogId
      })
    ).rejects.toThrow(
      `Registration not found: organisationId=${organisationId}, registrationId=${registrationId}`
    )

    expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
      summaryLogId,
      1,
      {
        status: 'invalid',
        failureReason: `Registration not found: organisationId=${organisationId}, registrationId=${registrationId}`
      }
    )
  })

  it('sets status to INVALID when registration has no wasteRegistrationNumber', async () => {
    const summaryLogId = 'test-summary-log-id'
    const organisationId = 'org-123'
    const registrationId = 'reg-456'

    const summaryLog = {
      file: {
        id: 'file-id',
        name: 'test.xlsx',
        s3: { bucket: 'test-bucket', key: 'test-key' }
      },
      organisationId,
      registrationId
    }

    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        id: registrationId
      })
    }

    const mockUploadsRepository = {
      findByLocation: vi.fn().mockResolvedValue(Buffer.from('test'))
    }

    const mockSummaryLogsRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn().mockResolvedValue()
    }

    const mockSummaryLogsParser = {
      parse: vi.fn().mockResolvedValue({
        meta: {
          REGISTRATION_NUMBER: { value: 'reg-456' },
          WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' }
        },
        data: {}
      })
    }

    await expect(
      summaryLogsValidator({
        uploadsRepository: mockUploadsRepository,
        summaryLogsRepository: mockSummaryLogsRepository,
        summaryLogsParser: mockSummaryLogsParser,
        organisationsRepository: mockOrganisationsRepository,
        summaryLogId
      })
    ).rejects.toThrow(
      'Invalid summary log: registration has no waste registration number'
    )

    expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
      summaryLogId,
      1,
      {
        status: 'invalid',
        failureReason:
          'Invalid summary log: registration has no waste registration number'
      }
    )
  })

  it('sets status to INVALID when spreadsheet missing waste registration number', async () => {
    const summaryLogId = 'test-summary-log-id'
    const organisationId = 'org-123'
    const registrationId = 'reg-456'

    const summaryLog = {
      file: {
        id: 'file-id',
        name: 'test.xlsx',
        s3: { bucket: 'test-bucket', key: 'test-key' }
      },
      organisationId,
      registrationId
    }

    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        id: registrationId,
        wasteRegistrationNumber: 'WRN12345'
      })
    }

    const mockUploadsRepository = {
      findByLocation: vi.fn().mockResolvedValue(Buffer.from('test'))
    }

    const mockSummaryLogsRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn().mockResolvedValue()
    }

    const mockSummaryLogsParser = {
      parse: vi.fn().mockResolvedValue({
        meta: {
          REGISTRATION_NUMBER: { value: 'reg-456' }
        },
        data: {}
      })
    }

    await expect(
      summaryLogsValidator({
        uploadsRepository: mockUploadsRepository,
        summaryLogsRepository: mockSummaryLogsRepository,
        summaryLogsParser: mockSummaryLogsParser,
        organisationsRepository: mockOrganisationsRepository,
        summaryLogId
      })
    ).rejects.toThrow('Invalid summary log: missing registration number')

    expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
      summaryLogId,
      1,
      {
        status: 'invalid',
        failureReason: 'Invalid summary log: missing registration number'
      }
    )
  })

  it('sets status to INVALID when waste registration numbers mismatch', async () => {
    const summaryLogId = 'test-summary-log-id'
    const organisationId = 'org-123'
    const registrationId = 'reg-456'

    const summaryLog = {
      file: {
        id: 'file-id',
        name: 'test.xlsx',
        s3: { bucket: 'test-bucket', key: 'test-key' }
      },
      organisationId,
      registrationId
    }

    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        id: registrationId,
        wasteRegistrationNumber: 'WRN12345'
      })
    }

    const mockUploadsRepository = {
      findByLocation: vi.fn().mockResolvedValue(Buffer.from('test'))
    }

    const mockSummaryLogsRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn().mockResolvedValue()
    }

    const mockSummaryLogsParser = {
      parse: vi.fn().mockResolvedValue({
        meta: {
          REGISTRATION_NUMBER: { value: 'reg-456' },
          WASTE_REGISTRATION_NUMBER: { value: 'WRN99999' }
        },
        data: {}
      })
    }

    await expect(
      summaryLogsValidator({
        uploadsRepository: mockUploadsRepository,
        summaryLogsRepository: mockSummaryLogsRepository,
        summaryLogsParser: mockSummaryLogsParser,
        organisationsRepository: mockOrganisationsRepository,
        summaryLogId
      })
    ).rejects.toThrow(
      'Registration number mismatch: spreadsheet contains WRN99999 but registration is WRN12345'
    )

    expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
      summaryLogId,
      1,
      {
        status: 'invalid',
        failureReason:
          'Registration number mismatch: spreadsheet contains WRN99999 but registration is WRN12345'
      }
    )
  })

  it('sets status to VALIDATED when waste registration numbers match', async () => {
    const summaryLogId = 'test-summary-log-id'
    const organisationId = 'org-123'
    const registrationId = 'reg-456'

    const summaryLog = {
      file: {
        id: 'file-id',
        name: 'test.xlsx',
        s3: { bucket: 'test-bucket', key: 'test-key' }
      },
      organisationId,
      registrationId
    }

    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        id: registrationId,
        wasteRegistrationNumber: 'WRN12345'
      })
    }

    const mockUploadsRepository = {
      findByLocation: vi.fn().mockResolvedValue(Buffer.from('test'))
    }

    const mockSummaryLogsRepository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog
      }),
      update: vi.fn().mockResolvedValue()
    }

    const mockSummaryLogsParser = {
      parse: vi.fn().mockResolvedValue({
        meta: {
          REGISTRATION_NUMBER: { value: 'reg-456' },
          WASTE_REGISTRATION_NUMBER: { value: 'WRN12345' }
        },
        data: {}
      })
    }

    await summaryLogsValidator({
      uploadsRepository: mockUploadsRepository,
      summaryLogsRepository: mockSummaryLogsRepository,
      summaryLogsParser: mockSummaryLogsParser,
      organisationsRepository: mockOrganisationsRepository,
      summaryLogId
    })

    expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
      summaryLogId,
      1,
      {
        status: 'validated'
      }
    )
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
      msg: 'test-msg'
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
        msg: 'test-msg'
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
      'Registration number mismatch: spreadsheet contains WRN99999 but registration is WRN12345'
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
