import { validateAccreditationNumber } from './validate-accreditation-number.js'

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

  it('throws error when registration has accreditation but spreadsheet is missing', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: 12345678
      }
    }
    const parsed = {
      meta: {}
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).toThrow('Invalid summary log: missing accreditation number')
  })

  it('throws error when registration has accreditation but spreadsheet value is undefined', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: 12345678
      }
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: undefined
        }
      }
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).toThrow('Invalid summary log: missing accreditation number')
  })

  it('throws error when accreditation numbers do not match', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: 12345678
      }
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: 99999999
        }
      }
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).toThrow(
      "Summary log's accreditation number does not match this registration"
    )
  })

  it('throws error when registration has no accreditation but spreadsheet has value', () => {
    const registration = {
      id: 'reg-123'
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: 12345678
        }
      }
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).toThrow(
      'Invalid summary log: accreditation number provided but registration has no accreditation'
    )
  })

  it('does not throw when accreditation numbers match', () => {
    const registration = {
      id: 'reg-123',
      accreditation: {
        id: 'acc-123',
        accreditationNumber: 12345678
      }
    }
    const parsed = {
      meta: {
        ACCREDITATION_NUMBER: {
          value: 12345678
        }
      }
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).not.toThrow()

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: 'Accreditation number validated: test-msg',
      event: {
        category: 'server',
        action: 'process_success'
      }
    })
  })

  it('does not throw when registration has no accreditation and spreadsheet is blank', () => {
    const registration = {
      id: 'reg-123'
    }
    const parsed = {
      meta: {}
    }

    expect(() =>
      validateAccreditationNumber({
        parsed,
        registration,
        loggingContext: 'test-msg'
      })
    ).not.toThrow()

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: 'Accreditation number validated: test-msg',
      event: {
        category: 'server',
        action: 'process_success'
      }
    })
  })
})
