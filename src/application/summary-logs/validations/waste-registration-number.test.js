import { validateWasteRegistrationNumber } from './waste-registration-number.js'

const mockLoggerInfo = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args)
  }
}))

describe('validateWasteRegistrationNumber', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

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
