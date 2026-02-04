import { validateRegistrationNumber } from './registration-number.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'

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

  it('returns fatal business error when registration has no registrationNumber', () => {
    const registration = {
      id: 'reg-123'
    }
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: {
          value: 'REG12345'
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
      'Invalid summary log: registration has no registration number'
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
  })

  it('returns fatal business error when registration numbers do not match', () => {
    const registration = {
      id: 'reg-123',
      registrationNumber: 'REG12345'
    }
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: {
          value: 'REG99999',
          location: { sheet: 'Cover', row: 12, column: 'F' }
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
      "Summary log's registration number does not match this registration"
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    expect(fatals[0].context.location).toEqual({
      sheet: 'Cover',
      row: 12,
      column: 'F',
      field: 'REGISTRATION_NUMBER'
    })
    expect(fatals[0].context.expected).toBe('REG12345')
    expect(fatals[0].context.actual).toBe('REG99999')
  })

  it('returns valid result when registration numbers match', () => {
    const registration = {
      id: 'reg-123',
      registrationNumber: 'REG12345'
    }
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: {
          value: 'REG12345'
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
      registrationNumber: 'REG12345'
    }
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: {
          value: 'REG99999',
          location: { sheet: 'Cover', row: 12, column: 'F' }
        }
      }
    }

    const result = validateRegistrationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    const error = result.getAllIssues()[0]
    expect(error.context.location).toEqual({
      sheet: 'Cover',
      row: 12,
      column: 'F',
      field: 'REGISTRATION_NUMBER'
    })
    expect(error.context.expected).toBe('REG12345')
    expect(error.context.actual).toBe('REG99999')
  })

  it('categorizes mismatched numbers as fatal business error', () => {
    const registration = {
      id: 'reg-123',
      registrationNumber: 'REG12345'
    }
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: {
          value: 'REG99999'
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

  it('matches when spreadsheet value has leading/trailing whitespace', () => {
    const registration = {
      id: 'reg-123',
      registrationNumber: 'REG12345'
    }
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: {
          value: '  REG12345  '
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
  })

  it('reports trimmed value as actual when spreadsheet value has whitespace and does not match', () => {
    const registration = {
      id: 'reg-123',
      registrationNumber: 'REG12345'
    }
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: {
          value: '  REG99999  '
        }
      }
    }

    const result = validateRegistrationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(result.isFatal()).toBe(true)
    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals[0].context.actual).toBe('REG99999')
  })

  it('coerces numeric spreadsheet value to string before comparing', () => {
    const registration = {
      id: 'reg-123',
      registrationNumber: '12345'
    }
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: {
          value: 12345
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
  })

  it('treats null spreadsheet value as mismatch when registration has a registrationNumber', () => {
    const registration = {
      id: 'reg-123',
      registrationNumber: 'REG12345'
    }
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: {
          value: null
        }
      }
    }

    const result = validateRegistrationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(result.isFatal()).toBe(true)
    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].context.actual).toBeNull()
  })

  it('handles missing location gracefully by including only field', () => {
    const registration = {
      id: 'reg-123',
      registrationNumber: 'REG12345'
    }
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: {
          value: 'REG99999' // No location provided
        }
      }
    }

    const result = validateRegistrationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(result.isFatal()).toBe(true)
    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals[0].context.location).toEqual({
      field: 'REGISTRATION_NUMBER' // Only field is set when location is missing
    })
  })
})
