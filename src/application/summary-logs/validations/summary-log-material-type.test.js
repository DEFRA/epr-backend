import { validateSummaryLogMaterialType } from './summary-log-material-type.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  }
}))

describe('validateSummaryLogMaterialType', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

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
