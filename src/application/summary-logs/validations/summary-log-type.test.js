import { validateSummaryLogType } from './summary-log-type.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  }
}))

describe('validateSummaryLogType', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

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
