import { describe, expect, it } from 'vitest'
import { REPROCESSED_LOADS } from './reprocessed-loads.js'

describe('REPROCESSED_LOADS', () => {
  const schema = REPROCESSED_LOADS

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has requiredHeaders array with expected fields', () => {
      expect(schema.requiredHeaders).toContain('ROW_ID')
      expect(schema.requiredHeaders).toContain('PRODUCT_TONNAGE')
    })

    it('has unfilledValues object', () => {
      expect(typeof schema.unfilledValues).toBe('object')
    })

    it('has fatalFields array with ROW_ID and PRODUCT_TONNAGE', () => {
      expect(Array.isArray(schema.fatalFields)).toBe(true)
      expect(schema.fatalFields).toContain('ROW_ID')
      expect(schema.fatalFields).toContain('PRODUCT_TONNAGE')
    })

    it('has fieldsRequiredForWasteBalance array with PRODUCT_TONNAGE', () => {
      expect(Array.isArray(schema.fieldsRequiredForWasteBalance)).toBe(true)
      expect(schema.fieldsRequiredForWasteBalance).toContain('PRODUCT_TONNAGE')
    })
  })

  describe('validationSchema (VAL010)', () => {
    const { validationSchema } = schema

    it('accepts empty object (all fields optional)', () => {
      const { error } = validationSchema.validate({})
      expect(error).toBeUndefined()
    })

    it('accepts unknown fields', () => {
      const { error } = validationSchema.validate({ UNKNOWN_FIELD: 'value' })
      expect(error).toBeUndefined()
    })

    describe('ROW_ID validation', () => {
      it('accepts valid ROW_ID at minimum (3000)', () => {
        const { error } = validationSchema.validate({ ROW_ID: 3000 })
        expect(error).toBeUndefined()
      })

      it('accepts valid ROW_ID above minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 3500 })
        expect(error).toBeUndefined()
      })

      it('rejects ROW_ID below minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 2999 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 3000')
      })

      it('rejects non-integer ROW_ID', () => {
        const { error } = validationSchema.validate({ ROW_ID: 3000.5 })
        expect(error).toBeDefined()
      })
    })

    describe('Weight field validations', () => {
      const weightFields = [
        'PRODUCT_TONNAGE',
        'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION'
      ]

      for (const field of weightFields) {
        describe(`${field} validation`, () => {
          it('accepts zero', () => {
            const { error } = validationSchema.validate({ [field]: 0 })
            expect(error).toBeUndefined()
          })

          it('accepts maximum value (1000)', () => {
            const { error } = validationSchema.validate({ [field]: 1000 })
            expect(error).toBeUndefined()
          })

          it('accepts value within range', () => {
            const { error } = validationSchema.validate({ [field]: 500.5 })
            expect(error).toBeUndefined()
          })

          it('rejects negative value', () => {
            const { error } = validationSchema.validate({ [field]: -1 })
            expect(error).toBeDefined()
            expect(error.details[0].message).toBe('must be at least 0')
          })

          it('rejects value above maximum (1000)', () => {
            const { error } = validationSchema.validate({ [field]: 1001 })
            expect(error).toBeDefined()
            expect(error.details[0].message).toBe('must be at most 1000')
          })

          it('rejects non-number', () => {
            const { error } = validationSchema.validate({
              [field]: 'not-a-number'
            })
            expect(error).toBeDefined()
            expect(error.details[0].message).toBe('must be a number')
          })
        })
      }
    })

    describe('DATE_LOAD_LEFT_SITE validation', () => {
      it('accepts valid Date object', () => {
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: new Date('2024-06-15')
        })
        expect(error).toBeUndefined()
      })

      it('accepts date string that can be parsed', () => {
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: '2024-06-15'
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid date string', () => {
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: 'not-a-date'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a valid date')
      })

      it('accepts numeric timestamps (Joi interprets as epoch ms)', () => {
        // Joi's date() validator accepts numbers as timestamps
        // ExcelJS will provide Date objects for date cells, so this is acceptable
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: 12345
        })
        expect(error).toBeUndefined()
      })
    })

    describe('UK_PACKAGING_WEIGHT_PERCENTAGE validation', () => {
      it('accepts zero', () => {
        const { error } = validationSchema.validate({
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0
        })
        expect(error).toBeUndefined()
      })

      it('accepts one (100%)', () => {
        const { error } = validationSchema.validate({
          UK_PACKAGING_WEIGHT_PERCENTAGE: 1
        })
        expect(error).toBeUndefined()
      })

      it('accepts value within range (0.5)', () => {
        const { error } = validationSchema.validate({
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.5
        })
        expect(error).toBeUndefined()
      })

      it('accepts small percentage (0.01 = 1%)', () => {
        const { error } = validationSchema.validate({
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.01
        })
        expect(error).toBeUndefined()
      })

      it('accepts high percentage (0.99 = 99%)', () => {
        const { error } = validationSchema.validate({
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.99
        })
        expect(error).toBeUndefined()
      })

      it('rejects negative value', () => {
        const { error } = validationSchema.validate({
          UK_PACKAGING_WEIGHT_PERCENTAGE: -0.1
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 0')
      })

      it('rejects value above 1', () => {
        const { error } = validationSchema.validate({
          UK_PACKAGING_WEIGHT_PERCENTAGE: 1.1
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 1')
      })

      it('rejects non-number', () => {
        const { error } = validationSchema.validate({
          UK_PACKAGING_WEIGHT_PERCENTAGE: 'fifty percent'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION calculation validation', () => {
      it('accepts correct calculation (500 × 0.75 = 375)', () => {
        const { error } = validationSchema.validate({
          PRODUCT_TONNAGE: 500,
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75,
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 375
        })
        expect(error).toBeUndefined()
      })

      it('accepts correct calculation with decimals (750.76 × 0.5 = 375.38)', () => {
        const { error } = validationSchema.validate({
          PRODUCT_TONNAGE: 750.76,
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.5,
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 375.38
        })
        expect(error).toBeUndefined()
      })

      it('accepts calculation within floating-point tolerance', () => {
        // 0.1 + 0.2 = 0.30000000000000004 in JS
        const { error } = validationSchema.validate({
          PRODUCT_TONNAGE: 100,
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.3,
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 30
        })
        expect(error).toBeUndefined()
      })

      it('accepts zero result (0 × 0.5 = 0)', () => {
        const { error } = validationSchema.validate({
          PRODUCT_TONNAGE: 0,
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.5,
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 0
        })
        expect(error).toBeUndefined()
      })

      it('accepts zero result (500 × 0 = 0)', () => {
        const { error } = validationSchema.validate({
          PRODUCT_TONNAGE: 500,
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0,
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 0
        })
        expect(error).toBeUndefined()
      })

      it('rejects incorrect calculation', () => {
        const { error } = validationSchema.validate({
          PRODUCT_TONNAGE: 500,
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75,
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 400 // Should be 375
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must equal PRODUCT_TONNAGE × UK_PACKAGING_WEIGHT_PERCENTAGE'
        )
      })

      it('rejects calculation that is close but outside tolerance', () => {
        const { error } = validationSchema.validate({
          PRODUCT_TONNAGE: 500,
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75,
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 375.001 // Off by 0.001
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must equal PRODUCT_TONNAGE × UK_PACKAGING_WEIGHT_PERCENTAGE'
        )
      })

      it('skips calculation check when PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION is missing', () => {
        const { error } = validationSchema.validate({
          PRODUCT_TONNAGE: 500,
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75
        })
        expect(error).toBeUndefined()
      })

      it('skips calculation check when PRODUCT_TONNAGE is missing', () => {
        const { error } = validationSchema.validate({
          UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75,
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 375
        })
        expect(error).toBeUndefined()
      })

      it('skips calculation check when UK_PACKAGING_WEIGHT_PERCENTAGE is missing', () => {
        const { error } = validationSchema.validate({
          PRODUCT_TONNAGE: 500,
          PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 375
        })
        expect(error).toBeUndefined()
      })

      it('skips calculation check when all three fields are missing', () => {
        const { error } = validationSchema.validate({
          ROW_ID: 3000,
          ADD_PRODUCT_WEIGHT: 'Yes'
        })
        expect(error).toBeUndefined()
      })
    })

    describe('ADD_PRODUCT_WEIGHT validation', () => {
      it('accepts "Yes"', () => {
        const { error } = validationSchema.validate({
          ADD_PRODUCT_WEIGHT: 'Yes'
        })
        expect(error).toBeUndefined()
      })

      it('accepts "No"', () => {
        const { error } = validationSchema.validate({
          ADD_PRODUCT_WEIGHT: 'No'
        })
        expect(error).toBeUndefined()
      })

      it('rejects lowercase "yes"', () => {
        const { error } = validationSchema.validate({
          ADD_PRODUCT_WEIGHT: 'yes'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })

      it('rejects lowercase "no"', () => {
        const { error } = validationSchema.validate({
          ADD_PRODUCT_WEIGHT: 'no'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })

      it('rejects uppercase "YES"', () => {
        const { error } = validationSchema.validate({
          ADD_PRODUCT_WEIGHT: 'YES'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })

      it('rejects other strings', () => {
        const { error } = validationSchema.validate({
          ADD_PRODUCT_WEIGHT: 'Maybe'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })

      it('rejects non-string values', () => {
        const { error } = validationSchema.validate({ ADD_PRODUCT_WEIGHT: 1 })
        expect(error).toBeDefined()
      })
    })

    describe('multiple field validation', () => {
      it('reports all errors when multiple fields invalid', () => {
        const { error } = validationSchema.validate({
          ROW_ID: 2999,
          PRODUCT_TONNAGE: 1001
        })
        expect(error).toBeDefined()
        expect(error.details.length).toBe(2)
      })

      it('reports errors for multiple new fields when invalid', () => {
        const { error } = validationSchema.validate({
          ADD_PRODUCT_WEIGHT: 'maybe',
          UK_PACKAGING_WEIGHT_PERCENTAGE: 1.5,
          DATE_LOAD_LEFT_SITE: 'invalid-date'
        })
        expect(error).toBeDefined()
        expect(error.details.length).toBe(3)
      })
    })
  })

  describe('structure with new fields', () => {
    it('has requiredHeaders array with all expected fields', () => {
      expect(schema.requiredHeaders).toContain('ROW_ID')
      expect(schema.requiredHeaders).toContain('PRODUCT_TONNAGE')
      expect(schema.requiredHeaders).toContain('ADD_PRODUCT_WEIGHT')
      expect(schema.requiredHeaders).toContain('UK_PACKAGING_WEIGHT_PERCENTAGE')
      expect(schema.requiredHeaders).toContain('DATE_LOAD_LEFT_SITE')
      expect(schema.requiredHeaders).toContain(
        'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION'
      )
    })

    it('has fatalFields array with all expected fields', () => {
      expect(schema.fatalFields).toContain('ROW_ID')
      expect(schema.fatalFields).toContain('PRODUCT_TONNAGE')
      expect(schema.fatalFields).toContain('ADD_PRODUCT_WEIGHT')
      expect(schema.fatalFields).toContain('UK_PACKAGING_WEIGHT_PERCENTAGE')
      expect(schema.fatalFields).toContain('DATE_LOAD_LEFT_SITE')
      expect(schema.fatalFields).toContain(
        'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION'
      )
    })

    it('has fieldsRequiredForWasteBalance array with all expected fields', () => {
      expect(schema.fieldsRequiredForWasteBalance).toContain('PRODUCT_TONNAGE')
      expect(schema.fieldsRequiredForWasteBalance).toContain(
        'ADD_PRODUCT_WEIGHT'
      )
      expect(schema.fieldsRequiredForWasteBalance).toContain(
        'UK_PACKAGING_WEIGHT_PERCENTAGE'
      )
      expect(schema.fieldsRequiredForWasteBalance).toContain(
        'DATE_LOAD_LEFT_SITE'
      )
      expect(schema.fieldsRequiredForWasteBalance).toContain(
        'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION'
      )
    })
  })
})
