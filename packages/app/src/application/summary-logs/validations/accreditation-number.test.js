import { validateAccreditationNumber } from './accreditation-number.js'

const mockLoggerInfo = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args)
  }
}))

describe('validateAccreditationNumber', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns fatal issue when registration has accreditation but spreadsheet is missing', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: '12345678'
      }
    }
    const parsed = {
      meta: {}
    }

    const issues = validateAccreditationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(issues.isFatal()).toBe(true)
    expect(issues.getAllIssues()).toHaveLength(1)
    expect(issues.getAllIssues()[0]).toMatchObject({
      severity: 'fatal',
      category: 'business',
      message: 'Invalid summary log: missing accreditation number'
    })
  })

  it('returns fatal issue when registration has accreditation but spreadsheet value is undefined', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: '12345678'
      }
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: undefined
        }
      }
    }

    const issues = validateAccreditationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(issues.isFatal()).toBe(true)
    expect(issues.getAllIssues()).toHaveLength(1)
    expect(issues.getAllIssues()[0]).toMatchObject({
      severity: 'fatal',
      category: 'business',
      message: 'Invalid summary log: missing accreditation number'
    })
  })

  it('returns fatal issue when accreditation numbers do not match', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: '12345678'
      }
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: '99999999',
          location: { sheet: 'Cover', row: 15, column: 'F' }
        }
      }
    }

    const issues = validateAccreditationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(issues.isFatal()).toBe(true)
    expect(issues.getAllIssues()).toHaveLength(1)
    expect(issues.getAllIssues()[0]).toMatchObject({
      severity: 'fatal',
      category: 'business',
      message:
        "Summary log's accreditation number does not match this registration",
      context: {
        location: {
          sheet: 'Cover',
          row: 15,
          column: 'F',
          field: 'ACCREDITATION_NUMBER'
        },
        expected: '12345678',
        actual: '99999999'
      }
    })
  })

  it('returns fatal issue when registration has no accreditation but spreadsheet has value', () => {
    const registration = {
      id: 'reg-123'
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: '12345678'
        }
      }
    }

    const issues = validateAccreditationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(issues.isFatal()).toBe(true)
    expect(issues.getAllIssues()).toHaveLength(1)
    expect(issues.getAllIssues()[0]).toMatchObject({
      severity: 'fatal',
      category: 'business',
      message:
        'Invalid summary log: accreditation number provided but registration has no accreditation',
      context: {
        actual: '12345678'
      }
    })
  })

  it('returns no issues when accreditation numbers match', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: '12345678'
      }
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: '12345678'
        }
      }
    }

    const issues = validateAccreditationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(issues.isFatal()).toBe(false)
    expect(issues.getAllIssues()).toHaveLength(0)

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message:
        'Accreditation number validated: test-msg, accreditationNumber=12345678',
      event: {
        category: 'server',
        action: 'process_success'
      }
    })
  })

  it('returns no issues when registration has no accreditation and spreadsheet is blank', () => {
    const registration = {
      id: 'reg-123'
    }
    const parsed = {
      meta: {}
    }

    const issues = validateAccreditationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(issues.isFatal()).toBe(false)
    expect(issues.getAllIssues()).toHaveLength(0)

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message:
        'Accreditation number validated: test-msg, accreditationNumber=none',
      event: {
        category: 'server',
        action: 'process_success'
      }
    })
  })

  it('handles missing location gracefully by including only field', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: '12345678'
      }
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: '99999999' // No location provided
        }
      }
    }

    const issues = validateAccreditationNumber({
      parsed,
      registration,
      loggingContext: 'test-msg'
    })

    expect(issues.isFatal()).toBe(true)
    const allIssues = issues.getAllIssues()
    expect(allIssues[0].context.location).toEqual({
      field: 'ACCREDITATION_NUMBER' // Only field is set when location is missing
    })
  })
})
