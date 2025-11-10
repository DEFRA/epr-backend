import { validateRegistrationNumber } from './registration-number.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/validation/validation-issues.js'

const mockLoggerInfo = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args)
  }
}))

describe('validateRegistrationNumber', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns fatal business error when registration has no wasteRegistrationNumber', () => {
    const registration = {
      id: 'reg-123'
    }
    const parsed = {
      meta: {
        REGISTRATION: {
          value: 'WRN12345'
        }
      }
    }

    const result = validateRegistrationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toBe(
      'Invalid summary log: registration has no waste registration number'
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
  })

  it('returns fatal business error when registration numbers do not match', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {
        REGISTRATION: {
          value: 'WRN99999'
        }
      }
    }

    const result = validateRegistrationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toBe(
      "Summary log's waste registration number does not match this registration"
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    expect(fatals[0].context.path).toBe('meta.REGISTRATION')
    expect(fatals[0].context.expected).toBe('WRN12345')
    expect(fatals[0].context.actual).toBe('WRN99999')
  })

  it('returns valid result when registration numbers match', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {
        REGISTRATION: {
          value: 'WRN12345'
        }
      }
    }

    const result = validateRegistrationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
    expect(mockLoggerInfo).toHaveBeenCalled()
  })

  it('includes helpful context in error messages', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {
        REGISTRATION: {
          value: 'WRN99999'
        }
      }
    }

    const result = validateRegistrationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    const error = result.getAllIssues()[0]
    expect(error.context.path).toBe('meta.REGISTRATION')
    expect(error.context.expected).toBe('WRN12345')
    expect(error.context.actual).toBe('WRN99999')
  })

  it('categorizes mismatched numbers as fatal business error', () => {
    const registration = {
      id: 'reg-123',
      wasteRegistrationNumber: 'WRN12345'
    }
    const parsed = {
      meta: {
        REGISTRATION: {
          value: 'WRN99999'
        }
      }
    }

    const result = validateRegistrationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(result.isFatal()).toBe(true)
    const issues = result.getIssuesByCategory(VALIDATION_CATEGORY.BUSINESS)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe(VALIDATION_SEVERITY.FATAL)
  })
})
