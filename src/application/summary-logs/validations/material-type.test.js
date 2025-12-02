import { validateMaterialType } from './material-type.js'
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

describe('validateMaterialType', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns fatal business error when registration has invalid material', () => {
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: { value: 'REG12345' },
        MATERIAL: { value: 'Aluminium' }
      }
    }
    const registration = {
      material: 'invalid-material'
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
      'Invalid summary log: registration has invalid material'
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    expect(fatals[0].context.actual).toBe('invalid-material')
  })

  it('returns fatal business error when materials do not match', () => {
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: { value: 'REG12345' },
        MATERIAL: {
          value: 'Aluminium',
          location: { sheet: 'Cover', row: 8, column: 'B' }
        }
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
    expect(fatals[0].context.location).toEqual({
      sheet: 'Cover',
      row: 8,
      column: 'B',
      field: 'MATERIAL'
    })
    expect(fatals[0].context.expected).toBe('aluminium')
    expect(fatals[0].context.actual).toBe('plastic')
  })

  it.each([
    ['Aluminium', 'aluminium'],
    ['Plastic', 'plastic']
  ])(
    'returns valid result when materials match - %s',
    (spreadsheetMaterial, registrationMaterial) => {
      const parsed = {
        meta: {
          REGISTRATION_NUMBER: { value: 'REG12345' },
          MATERIAL: { value: spreadsheetMaterial }
        }
      }
      const registration = {
        material: registrationMaterial
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
    }
  )

  it.each([
    ['Aluminium', 'aluminium'],
    ['Fibre_based_composite', 'fibre'],
    ['Glass', 'glass'],
    ['Paper_and_board', 'paper'],
    ['Plastic', 'plastic'],
    ['Steel', 'steel'],
    ['Wood', 'wood']
  ])('validates material mapping: %s → %s', (spreadsheet, registration) => {
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

  it('handles missing location gracefully by including only field', () => {
    const parsed = {
      meta: {
        MATERIAL: { value: 'Glass' } // No location provided
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
    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals[0].context.location).toEqual({
      field: 'MATERIAL' // Only field is set when location is missing
    })
  })
})
