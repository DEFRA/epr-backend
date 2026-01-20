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
        // AC01: Glass_remelt v Remelt = Pass
        {
          spreadsheetMaterial: 'Glass_remelt',
          glassRecyclingProcess: ['glass_re_melt'],
          shouldPass: true,
          ac: 'AC01'
        },
        // AC02: Glass_remelt v Other = Fail
        {
          spreadsheetMaterial: 'Glass_remelt',
          glassRecyclingProcess: ['glass_other'],
          shouldPass: false,
          ac: 'AC02'
        },
        // AC03: Glass_other v Remelt = Fail
        {
          spreadsheetMaterial: 'Glass_other',
          glassRecyclingProcess: ['glass_re_melt'],
          shouldPass: false,
          ac: 'AC03'
        },
        // AC04: Glass_other v Other = Pass
        {
          spreadsheetMaterial: 'Glass_other',
          glassRecyclingProcess: ['glass_other'],
          shouldPass: true,
          ac: 'AC04'
        }
      ])(
        '$ac: $spreadsheetMaterial vs $glassRecyclingProcess → $shouldPass',
        ({ spreadsheetMaterial, glassRecyclingProcess, shouldPass }) => {
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

          expect(result.isValid()).toBe(shouldPass)
        }
      )

      it.each([
        // AC05: Glass_remelt v Any non-glass material = Fail
        {
          spreadsheetMaterial: 'Glass_remelt',
          registrationMaterial: 'plastic',
          ac: 'AC05'
        },
        // AC06: Glass_other v Any non-glass material = Fail
        {
          spreadsheetMaterial: 'Glass_other',
          registrationMaterial: 'plastic',
          ac: 'AC06'
        }
      ])(
        '$ac: $spreadsheetMaterial vs non-glass registration ($registrationMaterial) → Fail',
        ({ spreadsheetMaterial, registrationMaterial }) => {
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
        // AC07: Glass_remelt v Remelt = Pass
        {
          spreadsheetMaterial: 'Glass_remelt',
          glassRecyclingProcess: ['glass_re_melt'],
          shouldPass: true,
          ac: 'AC07'
        },
        // AC08: Glass_remelt v Other = Fail
        {
          spreadsheetMaterial: 'Glass_remelt',
          glassRecyclingProcess: ['glass_other'],
          shouldPass: false,
          ac: 'AC08'
        },
        // AC09: Glass_other v Remelt = Fail
        {
          spreadsheetMaterial: 'Glass_other',
          glassRecyclingProcess: ['glass_re_melt'],
          shouldPass: false,
          ac: 'AC09'
        },
        // AC10: Glass_other v Other = Pass
        {
          spreadsheetMaterial: 'Glass_other',
          glassRecyclingProcess: ['glass_other'],
          shouldPass: true,
          ac: 'AC10'
        }
      ])(
        '$ac: $spreadsheetMaterial vs $glassRecyclingProcess → $shouldPass',
        ({ spreadsheetMaterial, glassRecyclingProcess, shouldPass }) => {
          const parsed = {
            meta: {
              MATERIAL: { value: spreadsheetMaterial }
            }
          }
          // Accredited operator - has an accreditationId on registration
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

          expect(result.isValid()).toBe(shouldPass)
        }
      )

      it.each([
        // AC11: Glass_remelt v Any non-glass material = Fail
        {
          spreadsheetMaterial: 'Glass_remelt',
          registrationMaterial: 'aluminium',
          ac: 'AC11'
        },
        // AC12: Glass_other v Any non-glass material = Fail
        {
          spreadsheetMaterial: 'Glass_other',
          registrationMaterial: 'aluminium',
          ac: 'AC12'
        }
      ])(
        '$ac: $spreadsheetMaterial vs non-glass accredited registration ($registrationMaterial) → Fail',
        ({ spreadsheetMaterial, registrationMaterial }) => {
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
