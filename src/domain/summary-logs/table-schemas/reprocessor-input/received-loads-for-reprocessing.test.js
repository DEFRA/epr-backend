import { describe, expect, it } from 'vitest'
import { RECEIVED_LOADS_FOR_REPROCESSING } from './received-loads-for-reprocessing.js'

describe('RECEIVED_LOADS_FOR_REPROCESSING', () => {
  const schema = RECEIVED_LOADS_FOR_REPROCESSING

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has requiredHeaders array with expected fields', () => {
      expect(schema.requiredHeaders).toContain('ROW_ID')
      expect(schema.requiredHeaders).toContain('DATE_RECEIVED_FOR_REPROCESSING')
      expect(schema.requiredHeaders).toContain('EWC_CODE')
      expect(schema.requiredHeaders).toContain('GROSS_WEIGHT')
      expect(schema.requiredHeaders).toContain('TARE_WEIGHT')
      expect(schema.requiredHeaders).toContain('PALLET_WEIGHT')
      expect(schema.requiredHeaders).toContain('NET_WEIGHT')
      expect(schema.requiredHeaders).toContain('BAILING_WIRE_PROTOCOL')
      expect(schema.requiredHeaders).toContain(
        'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION'
      )
      expect(schema.requiredHeaders).toContain('WEIGHT_OF_NON_TARGET_MATERIALS')
      expect(schema.requiredHeaders).toContain(
        'RECYCLABLE_PROPORTION_PERCENTAGE'
      )
      expect(schema.requiredHeaders).toContain('TONNAGE_RECEIVED_FOR_RECYCLING')
      expect(schema.requiredHeaders).toContain(
        'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE'
      )
    })

    it('has unfilledValues object with dropdown placeholders', () => {
      expect(typeof schema.unfilledValues).toBe('object')
      expect(schema.unfilledValues.BAILING_WIRE_PROTOCOL).toContain(
        'Choose option'
      )
      expect(
        schema.unfilledValues.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
      ).toContain('Choose option')
    })

    it('has fatalFields array with all validated fields', () => {
      expect(Array.isArray(schema.fatalFields)).toBe(true)
      expect(schema.fatalFields).toContain('ROW_ID')
      expect(schema.fatalFields).toContain('DATE_RECEIVED_FOR_REPROCESSING')
      expect(schema.fatalFields).toContain('GROSS_WEIGHT')
      expect(schema.fatalFields).toContain('TARE_WEIGHT')
      expect(schema.fatalFields).toContain('PALLET_WEIGHT')
      expect(schema.fatalFields).toContain('NET_WEIGHT')
      expect(schema.fatalFields).toContain('BAILING_WIRE_PROTOCOL')
      expect(schema.fatalFields).toContain('WEIGHT_OF_NON_TARGET_MATERIALS')
      expect(schema.fatalFields).toContain('RECYCLABLE_PROPORTION_PERCENTAGE')
      expect(schema.fatalFields).toContain(
        'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE'
      )
    })

    it('has fieldsRequiredForWasteBalance array with validated fields', () => {
      expect(Array.isArray(schema.fieldsRequiredForWasteBalance)).toBe(true)
      expect(schema.fieldsRequiredForWasteBalance).toContain('ROW_ID')
      expect(schema.fieldsRequiredForWasteBalance).toContain(
        'DATE_RECEIVED_FOR_REPROCESSING'
      )
      expect(schema.fieldsRequiredForWasteBalance).toContain(
        'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE'
      )
      expect(schema.fieldsRequiredForWasteBalance).toContain('GROSS_WEIGHT')
      expect(schema.fieldsRequiredForWasteBalance).toContain('TARE_WEIGHT')
      expect(schema.fieldsRequiredForWasteBalance).toContain('PALLET_WEIGHT')
      expect(schema.fieldsRequiredForWasteBalance).toContain('NET_WEIGHT')
      expect(schema.fieldsRequiredForWasteBalance).toContain(
        'BAILING_WIRE_PROTOCOL'
      )
      expect(schema.fieldsRequiredForWasteBalance).toContain(
        'WEIGHT_OF_NON_TARGET_MATERIALS'
      )
      expect(schema.fieldsRequiredForWasteBalance).toContain(
        'RECYCLABLE_PROPORTION_PERCENTAGE'
      )
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
      it('accepts valid ROW_ID at minimum (1000)', () => {
        const { error } = validationSchema.validate({ ROW_ID: 1000 })
        expect(error).toBeUndefined()
      })

      it('accepts valid ROW_ID above minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 1500 })
        expect(error).toBeUndefined()
      })

      it('rejects ROW_ID below minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 999 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 1000')
      })

      it('rejects non-integer ROW_ID', () => {
        const { error } = validationSchema.validate({ ROW_ID: 1000.5 })
        expect(error).toBeDefined()
      })
    })

    describe('DATE_RECEIVED_FOR_REPROCESSING validation', () => {
      it('accepts valid Date object', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_FOR_REPROCESSING: new Date('2024-01-15')
        })
        expect(error).toBeUndefined()
      })

      it('accepts date string that can be parsed', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_FOR_REPROCESSING: '2024-01-15'
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid date string', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_FOR_REPROCESSING: 'not-a-date'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a valid date')
      })
    })

    describe('EWC_CODE validation', () => {
      it('accepts valid EWC code', () => {
        const { error } = validationSchema.validate({ EWC_CODE: '03 03 08' })
        expect(error).toBeUndefined()
      })

      it('accepts valid EWC code with asterisk suffix', () => {
        const { error } = validationSchema.validate({ EWC_CODE: '01 03 04*' })
        expect(error).toBeUndefined()
      })

      it('rejects invalid EWC code format', () => {
        const { error } = validationSchema.validate({ EWC_CODE: '030308' })
        expect(error).toBeDefined()
        expect(error.details[0].message).toContain('must be in format')
      })
    })

    describe('GROSS_WEIGHT validation', () => {
      it('accepts zero', () => {
        const { error } = validationSchema.validate({ GROSS_WEIGHT: 0 })
        expect(error).toBeUndefined()
      })

      it('accepts maximum value (1000)', () => {
        const { error } = validationSchema.validate({ GROSS_WEIGHT: 1000 })
        expect(error).toBeUndefined()
      })

      it('accepts value within range', () => {
        const { error } = validationSchema.validate({ GROSS_WEIGHT: 500.5 })
        expect(error).toBeUndefined()
      })

      it('rejects negative value', () => {
        const { error } = validationSchema.validate({ GROSS_WEIGHT: -1 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 0')
      })

      it('rejects value above maximum (1000)', () => {
        const { error } = validationSchema.validate({ GROSS_WEIGHT: 1001 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 1000')
      })

      it('rejects non-number', () => {
        const { error } = validationSchema.validate({ GROSS_WEIGHT: 'heavy' })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('TARE_WEIGHT validation', () => {
      it('accepts zero', () => {
        const { error } = validationSchema.validate({ TARE_WEIGHT: 0 })
        expect(error).toBeUndefined()
      })

      it('accepts maximum value (1000)', () => {
        const { error } = validationSchema.validate({ TARE_WEIGHT: 1000 })
        expect(error).toBeUndefined()
      })

      it('accepts value within range', () => {
        const { error } = validationSchema.validate({ TARE_WEIGHT: 50.25 })
        expect(error).toBeUndefined()
      })

      it('rejects negative value', () => {
        const { error } = validationSchema.validate({ TARE_WEIGHT: -0.5 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 0')
      })

      it('rejects value above maximum (1000)', () => {
        const { error } = validationSchema.validate({ TARE_WEIGHT: 1000.1 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 1000')
      })

      it('rejects non-number', () => {
        const { error } = validationSchema.validate({ TARE_WEIGHT: 'light' })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('PALLET_WEIGHT validation', () => {
      it('accepts zero', () => {
        const { error } = validationSchema.validate({ PALLET_WEIGHT: 0 })
        expect(error).toBeUndefined()
      })

      it('accepts maximum value (1000)', () => {
        const { error } = validationSchema.validate({ PALLET_WEIGHT: 1000 })
        expect(error).toBeUndefined()
      })

      it('accepts value within range', () => {
        const { error } = validationSchema.validate({ PALLET_WEIGHT: 25.5 })
        expect(error).toBeUndefined()
      })

      it('rejects negative value', () => {
        const { error } = validationSchema.validate({ PALLET_WEIGHT: -1 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 0')
      })

      it('rejects value above maximum (1000)', () => {
        const { error } = validationSchema.validate({ PALLET_WEIGHT: 1001 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 1000')
      })

      it('rejects non-number', () => {
        const { error } = validationSchema.validate({
          PALLET_WEIGHT: 'not-a-number'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('WEIGHT_OF_NON_TARGET_MATERIALS validation', () => {
      it('accepts zero', () => {
        const { error } = validationSchema.validate({
          WEIGHT_OF_NON_TARGET_MATERIALS: 0
        })
        expect(error).toBeUndefined()
      })

      it('accepts maximum value (1000)', () => {
        const { error } = validationSchema.validate({
          WEIGHT_OF_NON_TARGET_MATERIALS: 1000
        })
        expect(error).toBeUndefined()
      })

      it('accepts value within range', () => {
        const { error } = validationSchema.validate({
          WEIGHT_OF_NON_TARGET_MATERIALS: 10.5
        })
        expect(error).toBeUndefined()
      })

      it('rejects negative value', () => {
        const { error } = validationSchema.validate({
          WEIGHT_OF_NON_TARGET_MATERIALS: -1
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 0')
      })

      it('rejects value above maximum (1000)', () => {
        const { error } = validationSchema.validate({
          WEIGHT_OF_NON_TARGET_MATERIALS: 1001
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 1000')
      })

      it('rejects non-number', () => {
        const { error } = validationSchema.validate({
          WEIGHT_OF_NON_TARGET_MATERIALS: 'contaminants'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('RECYCLABLE_PROPORTION_PERCENTAGE validation', () => {
      it('accepts zero', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: 0
        })
        expect(error).toBeUndefined()
      })

      it('accepts one (100%)', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: 1
        })
        expect(error).toBeUndefined()
      })

      it('accepts value within range (0.5)', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.5
        })
        expect(error).toBeUndefined()
      })

      it('accepts small percentage (0.01 = 1%)', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.01
        })
        expect(error).toBeUndefined()
      })

      it('accepts high percentage (0.99 = 99%)', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.99
        })
        expect(error).toBeUndefined()
      })

      it('rejects negative value', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: -0.1
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 0')
      })

      it('rejects value above 1', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: 1.1
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 1')
      })

      it('rejects non-number', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: 'fifty percent'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('BAILING_WIRE_PROTOCOL validation', () => {
      it('accepts "Yes"', () => {
        const { error } = validationSchema.validate({
          BAILING_WIRE_PROTOCOL: 'Yes'
        })
        expect(error).toBeUndefined()
      })

      it('accepts "No"', () => {
        const { error } = validationSchema.validate({
          BAILING_WIRE_PROTOCOL: 'No'
        })
        expect(error).toBeUndefined()
      })

      it('rejects lowercase "yes"', () => {
        const { error } = validationSchema.validate({
          BAILING_WIRE_PROTOCOL: 'yes'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })

      it('rejects lowercase "no"', () => {
        const { error } = validationSchema.validate({
          BAILING_WIRE_PROTOCOL: 'no'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })

      it('rejects uppercase "YES"', () => {
        const { error } = validationSchema.validate({
          BAILING_WIRE_PROTOCOL: 'YES'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })

      it('rejects other strings', () => {
        const { error } = validationSchema.validate({
          BAILING_WIRE_PROTOCOL: 'Maybe'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })
    })

    describe('WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE validation', () => {
      it('accepts "Yes"', () => {
        const { error } = validationSchema.validate({
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'Yes'
        })
        expect(error).toBeUndefined()
      })

      it('accepts "No"', () => {
        const { error } = validationSchema.validate({
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No'
        })
        expect(error).toBeUndefined()
      })

      it('rejects lowercase "yes"', () => {
        const { error } = validationSchema.validate({
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'yes'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })

      it('rejects lowercase "no"', () => {
        const { error } = validationSchema.validate({
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'no'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })

      it('rejects other strings', () => {
        const { error } = validationSchema.validate({
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'N/A'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be Yes or No')
      })
    })

    describe('NET_WEIGHT calculation validation', () => {
      it('accepts correct calculation (100 - 5 - 5 = 90)', () => {
        const { error } = validationSchema.validate({
          GROSS_WEIGHT: 100,
          TARE_WEIGHT: 5,
          PALLET_WEIGHT: 5,
          NET_WEIGHT: 90
        })
        expect(error).toBeUndefined()
      })

      it('accepts correct calculation with decimals (100.5 - 10.25 - 5.25 = 85)', () => {
        const { error } = validationSchema.validate({
          GROSS_WEIGHT: 100.5,
          TARE_WEIGHT: 10.25,
          PALLET_WEIGHT: 5.25,
          NET_WEIGHT: 85
        })
        expect(error).toBeUndefined()
      })

      it('accepts calculation within floating-point tolerance', () => {
        const { error } = validationSchema.validate({
          GROSS_WEIGHT: 100,
          TARE_WEIGHT: 33.33,
          PALLET_WEIGHT: 33.33,
          NET_WEIGHT: 33.34
        })
        expect(error).toBeUndefined()
      })

      it('accepts zero result (50 - 25 - 25 = 0)', () => {
        const { error } = validationSchema.validate({
          GROSS_WEIGHT: 50,
          TARE_WEIGHT: 25,
          PALLET_WEIGHT: 25,
          NET_WEIGHT: 0
        })
        expect(error).toBeUndefined()
      })

      it('rejects incorrect calculation', () => {
        const { error } = validationSchema.validate({
          GROSS_WEIGHT: 100,
          TARE_WEIGHT: 5,
          PALLET_WEIGHT: 5,
          NET_WEIGHT: 100
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'
        )
      })

      it('rejects calculation that is close but outside tolerance', () => {
        const { error } = validationSchema.validate({
          GROSS_WEIGHT: 100,
          TARE_WEIGHT: 5,
          PALLET_WEIGHT: 5,
          NET_WEIGHT: 90.001
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'
        )
      })

      it('skips calculation check when NET_WEIGHT is missing', () => {
        const { error } = validationSchema.validate({
          GROSS_WEIGHT: 100,
          TARE_WEIGHT: 5,
          PALLET_WEIGHT: 5
        })
        expect(error).toBeUndefined()
      })

      it('skips calculation check when GROSS_WEIGHT is missing', () => {
        const { error } = validationSchema.validate({
          TARE_WEIGHT: 5,
          PALLET_WEIGHT: 5,
          NET_WEIGHT: 90
        })
        expect(error).toBeUndefined()
      })

      it('skips calculation check when TARE_WEIGHT is missing', () => {
        const { error } = validationSchema.validate({
          GROSS_WEIGHT: 100,
          PALLET_WEIGHT: 5,
          NET_WEIGHT: 90
        })
        expect(error).toBeUndefined()
      })

      it('skips calculation check when PALLET_WEIGHT is missing', () => {
        const { error } = validationSchema.validate({
          GROSS_WEIGHT: 100,
          TARE_WEIGHT: 5,
          NET_WEIGHT: 90
        })
        expect(error).toBeUndefined()
      })

      it('skips calculation check when all weight fields are missing', () => {
        const { error } = validationSchema.validate({
          ROW_ID: 1000,
          EWC_CODE: '03 03 08'
        })
        expect(error).toBeUndefined()
      })
    })

    describe('multiple field validation', () => {
      it('reports all errors when multiple fields invalid', () => {
        const { error } = validationSchema.validate({
          ROW_ID: 999,
          GROSS_WEIGHT: -1,
          RECYCLABLE_PROPORTION_PERCENTAGE: 1.5
        })
        expect(error).toBeDefined()
        expect(error.details.length).toBe(3)
      })

      it('reports errors for multiple weight fields when invalid', () => {
        const { error } = validationSchema.validate({
          GROSS_WEIGHT: 1001,
          TARE_WEIGHT: -1,
          PALLET_WEIGHT: 1001
        })
        expect(error).toBeDefined()
        expect(error.details.length).toBe(3)
      })

      it('reports errors for Yes/No fields when invalid', () => {
        const { error } = validationSchema.validate({
          BAILING_WIRE_PROTOCOL: 'maybe',
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'unknown'
        })
        expect(error).toBeDefined()
        expect(error.details.length).toBe(2)
      })
    })
  })
})
