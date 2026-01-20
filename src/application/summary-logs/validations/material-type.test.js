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

  describe('glass material validation', () => {
    describe('registration-only operators', () => {
      it.each([
        ['Glass_remelt', ['glass_re_melt']],
        ['Glass_other', ['glass_other']]
      ])(
        'passes when %s matches registration glassRecyclingProcess %s',
        (spreadsheetMaterial, glassRecyclingProcess) => {
          const parsed = {
            meta: {
              MATERIAL: { value: spreadsheetMaterial }
            }
          }
          const registration = {
            material: 'glass',
            glassRecyclingProcess
          }

          const result = validateMaterialType({
            parsed,
            registration,
            loggingContext: 'test'
          })

          expect(result.isValid()).toBe(true)
        }
      )

      it.each([
        ['Glass_remelt', ['glass_other']],
        ['Glass_other', ['glass_re_melt']]
      ])(
        'fails when %s does not match registration glassRecyclingProcess %s',
        (spreadsheetMaterial, glassRecyclingProcess) => {
          const parsed = {
            meta: {
              MATERIAL: { value: spreadsheetMaterial }
            }
          }
          const registration = {
            material: 'glass',
            glassRecyclingProcess
          }

          const result = validateMaterialType({
            parsed,
            registration,
            loggingContext: 'test'
          })

          expect(result.isValid()).toBe(false)
        }
      )

      it.each([
        ['Glass_remelt', 'plastic'],
        ['Glass_other', 'plastic']
      ])(
        'fails when %s is uploaded against non-glass registration (%s)',
        (spreadsheetMaterial, registrationMaterial) => {
          const parsed = {
            meta: {
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

          expect(result.isValid()).toBe(false)
        }
      )
    })

    describe('accredited operators (via associated registration)', () => {
      it.each([
        ['Glass_remelt', ['glass_re_melt']],
        ['Glass_other', ['glass_other']]
      ])(
        'passes when %s matches registration glassRecyclingProcess %s',
        (spreadsheetMaterial, glassRecyclingProcess) => {
          const parsed = {
            meta: {
              MATERIAL: { value: spreadsheetMaterial }
            }
          }
          const registration = {
            material: 'glass',
            glassRecyclingProcess,
            accreditationId: 'acc-123'
          }

          const result = validateMaterialType({
            parsed,
            registration,
            loggingContext: 'test'
          })

          expect(result.isValid()).toBe(true)
        }
      )

      it.each([
        ['Glass_remelt', ['glass_other']],
        ['Glass_other', ['glass_re_melt']]
      ])(
        'fails when %s does not match registration glassRecyclingProcess %s',
        (spreadsheetMaterial, glassRecyclingProcess) => {
          const parsed = {
            meta: {
              MATERIAL: { value: spreadsheetMaterial }
            }
          }
          const registration = {
            material: 'glass',
            glassRecyclingProcess,
            accreditationId: 'acc-123'
          }

          const result = validateMaterialType({
            parsed,
            registration,
            loggingContext: 'test'
          })

          expect(result.isValid()).toBe(false)
        }
      )

      it.each([
        ['Glass_remelt', 'aluminium'],
        ['Glass_other', 'aluminium']
      ])(
        'fails when %s is uploaded against non-glass registration (%s)',
        (spreadsheetMaterial, registrationMaterial) => {
          const parsed = {
            meta: {
              MATERIAL: { value: spreadsheetMaterial }
            }
          }
          const registration = {
            material: registrationMaterial,
            accreditationId: 'acc-123'
          }

          const result = validateMaterialType({
            parsed,
            registration,
            loggingContext: 'test'
          })

          expect(result.isValid()).toBe(false)
        }
      )
    })
  })

  it('categorizes material mismatch as fatal business error', () => {
    const parsed = {
      meta: {
        MATERIAL: { value: 'Plastic' }
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

    expect(result.isFatal()).toBe(true)
    const issues = result.getIssuesByCategory(VALIDATION_CATEGORY.BUSINESS)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe(VALIDATION_SEVERITY.FATAL)
  })

  it('handles missing location gracefully by including only field', () => {
    const parsed = {
      meta: {
        MATERIAL: { value: 'Plastic' } // No location provided
      }
    }
    const registration = {
      material: 'steel'
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
