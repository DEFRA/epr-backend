import { validateMaterialType } from './material-type.js'
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

describe('validateMaterialType', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns fatal business error when registration has unexpected material', () => {
    const parsed = {
      meta: {
        REGISTRATION: { value: 'WRN12345' },
        MATERIAL: { value: 'Aluminium' }
      }
    }
    const registration = {
      material: 'invalid-unexpected-material'
    }

    const result = validateMaterialType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toBe(
      'Invalid summary log: registration has unexpected material'
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    expect(fatals[0].context.actual).toBe('invalid-unexpected-material')
  })

  it('returns fatal business error when materials do not match', () => {
    const parsed = {
      meta: {
        REGISTRATION: { value: 'WRN12345' },
        MATERIAL: { value: 'Aluminium' }
      }
    }
    const registration = {
      material: 'plastic'
    }

    const result = validateMaterialType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toBe(
      'Material does not match registration material'
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    expect(fatals[0].context.path).toBe('meta.MATERIAL')
    expect(fatals[0].context.expected).toBe('aluminium')
    expect(fatals[0].context.actual).toBe('plastic')
  })

  it('returns valid result when materials match - Aluminium', () => {
    const parsed = {
      meta: {
        REGISTRATION: { value: 'WRN12345' },
        MATERIAL: { value: 'Aluminium' }
      }
    }
    const registration = {
      material: 'aluminium'
    }

    const result = validateMaterialType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Validated material: test, spreadsheetMaterial=Aluminium, registrationMaterial=aluminium'
      })
    )
  })

  it('returns valid result when materials match - Plastic', () => {
    const parsed = {
      meta: {
        REGISTRATION: { value: 'WRN12345' },
        MATERIAL: { value: 'Plastic' }
      }
    }
    const registration = {
      material: 'plastic'
    }

    const result = validateMaterialType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
    expect(mockLoggerInfo).toHaveBeenCalled()
  })

  it('returns valid result for all valid material mappings', () => {
    const materials = [
      ['Aluminium', 'aluminium'],
      ['Fibre_based_composite', 'fibre'],
      ['Glass', 'glass'],
      ['Paper_and_board', 'paper'],
      ['Plastic', 'plastic'],
      ['Steel', 'steel'],
      ['Wood', 'wood']
    ]

    materials.forEach(([spreadsheet, registration]) => {
      const parsed = {
        meta: {
          MATERIAL: { value: spreadsheet }
        }
      }
      const reg = {
        material: registration
      }

      const result = validateMaterialType({
        parsed,
        registration: reg,
        loggingContext: 'test'
      })

      expect(result.isValid()).toBe(true)
    })
  })

  it('categorizes material mismatch as fatal business error', () => {
    const parsed = {
      meta: {
        MATERIAL: { value: 'Glass' }
      }
    }
    const registration = {
      material: 'plastic'
    }

    const result = validateMaterialType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isFatal()).toBe(true)
    const issues = result.getIssuesByCategory(VALIDATION_CATEGORY.BUSINESS)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe(VALIDATION_SEVERITY.FATAL)
  })
})
