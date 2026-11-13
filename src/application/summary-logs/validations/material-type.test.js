import { validateMaterialType } from './material-type.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { materialFromSpreadsheet } from '#domain/summary-logs/stored-meta.js'

/** @import {Registration} from '#organisation-read-model/domain/model.js' */

/**
 * A registration the read model serves with this material.
 *
 * @param {string} material
 * @returns {Pick<Registration, 'material'>}
 */
const registeredAs = (material) =>
  /** @type {Pick<Registration, 'material'>} */ ({ material })

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
    const registration = registeredAs('plastic')

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
    expect(fatals[0].context?.location).toEqual({
      sheet: 'Cover',
      row: 8,
      column: 'B',
      field: 'MATERIAL'
    })
    expect(fatals[0].context?.expected).toBe('aluminium')
    expect(fatals[0].context?.actual).toBe('plastic')
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
      const registration = registeredAs(registrationMaterial)

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
    const reg = registeredAs(registration)

    const result = validateMaterialType({
      parsed,
      registration: reg,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(true)
  })

  describe('glass', () => {
    it.each([
      ['Glass_remelt', 'glass_re_melt'],
      ['Glass_other', 'glass_other']
    ])('passes when %s is uploaded against %s', (spreadsheet, material) => {
      const result = validateMaterialType({
        parsed: { meta: { MATERIAL: { value: spreadsheet } } },
        registration: registeredAs(material),
        loggingContext: 'test'
      })

      expect(result.isValid()).toBe(true)
    })

    it.each([
      ['Glass_remelt', 'glass_other'],
      ['Glass_other', 'glass_re_melt'],
      ['Glass_remelt', 'plastic'],
      ['Plastic', 'glass_re_melt']
    ])(
      'fails when %s is uploaded against %s, naming both materials',
      (spreadsheet, material) => {
        const result = validateMaterialType({
          parsed: { meta: { MATERIAL: { value: spreadsheet } } },
          registration: registeredAs(material),
          loggingContext: 'test'
        })

        const [fatal] = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
        expect(fatal).toMatchObject({
          code: VALIDATION_CODE.MATERIAL_MISMATCH,
          context: {
            expected: materialFromSpreadsheet(spreadsheet),
            actual: material
          }
        })
      }
    )
  })

  it('categorizes material mismatch as fatal business error', () => {
    const parsed = {
      meta: {
        MATERIAL: { value: 'Plastic' }
      }
    }
    const registration = registeredAs('aluminium')

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
    const registration = registeredAs('steel')

    const result = validateMaterialType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isFatal()).toBe(true)
    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals[0].context?.location).toEqual({
      field: 'MATERIAL' // Only field is set when location is missing
    })
  })

  describe('unrecognised material validation', () => {
    it('returns fatal business error when material is "Choose material" placeholder', () => {
      const parsed = {
        meta: {
          MATERIAL: {
            value: 'Choose material',
            location: { sheet: 'Cover', row: 8, column: 'B' }
          }
        }
      }
      const registration = registeredAs('aluminium')

      const result = validateMaterialType({
        parsed,
        registration,
        loggingContext: 'test'
      })

      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].code).toBe('MATERIAL_REQUIRED')
      expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
      expect(fatals[0].context?.actual).toBe('Choose material')
      expect(fatals[0].context?.location).toEqual({
        sheet: 'Cover',
        row: 8,
        column: 'B',
        field: 'MATERIAL'
      })
    })

    it('returns fatal business error when material is null', () => {
      const parsed = {
        meta: {
          MATERIAL: { value: null }
        }
      }
      const registration = registeredAs('aluminium')

      const result = validateMaterialType({
        parsed,
        registration,
        loggingContext: 'test'
      })

      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].code).toBe('MATERIAL_REQUIRED')
    })

    it('returns fatal business error when material field is missing from meta', () => {
      const parsed = {
        meta: {}
      }
      const registration = registeredAs('aluminium')

      const result = validateMaterialType({
        parsed,
        registration,
        loggingContext: 'test'
      })

      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].code).toBe('MATERIAL_REQUIRED')
    })

    it('returns fatal business error for any unrecognised material string', () => {
      const parsed = {
        meta: {
          MATERIAL: { value: 'NotARealMaterial' }
        }
      }
      const registration = registeredAs('aluminium')

      const result = validateMaterialType({
        parsed,
        registration,
        loggingContext: 'test'
      })

      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].code).toBe('MATERIAL_REQUIRED')
      expect(fatals[0].context?.actual).toBe('NotARealMaterial')
    })
  })
})
