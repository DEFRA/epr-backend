import { describe, expect, it } from 'vitest'
import { RECEIVED_LOADS_FOR_REPROCESSING } from './received-loads-for-reprocessing.js'

describe('RECEIVED_LOADS_FOR_REPROCESSING', () => {
  const schema = RECEIVED_LOADS_FOR_REPROCESSING

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    describe('requiredHeaders (VAL008 - column presence validation)', () => {
      it('contains all waste balance columns (Section 1)', () => {
        expect(schema.requiredHeaders).toContain('ROW_ID')
        expect(schema.requiredHeaders).toContain(
          'DATE_RECEIVED_FOR_REPROCESSING'
        )
        expect(schema.requiredHeaders).toContain('EWC_CODE')
        expect(schema.requiredHeaders).toContain('DESCRIPTION_WASTE')
        expect(schema.requiredHeaders).toContain('GROSS_WEIGHT')
        expect(schema.requiredHeaders).toContain('TARE_WEIGHT')
        expect(schema.requiredHeaders).toContain('PALLET_WEIGHT')
        expect(schema.requiredHeaders).toContain('NET_WEIGHT')
        expect(schema.requiredHeaders).toContain('BAILING_WIRE_PROTOCOL')
        expect(schema.requiredHeaders).toContain(
          'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION'
        )
        expect(schema.requiredHeaders).toContain(
          'WEIGHT_OF_NON_TARGET_MATERIALS'
        )
        expect(schema.requiredHeaders).toContain(
          'RECYCLABLE_PROPORTION_PERCENTAGE'
        )
        expect(schema.requiredHeaders).toContain(
          'TONNAGE_RECEIVED_FOR_RECYCLING'
        )
        expect(schema.requiredHeaders).toContain(
          'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE'
        )
      })

      it('contains all supplementary columns from template (Sections 2 & 3)', () => {
        expect(schema.requiredHeaders).toContain('SUPPLIER_NAME')
        expect(schema.requiredHeaders).toContain('SUPPLIER_ADDRESS')
        expect(schema.requiredHeaders).toContain('SUPPLIER_POSTCODE')
        expect(schema.requiredHeaders).toContain('SUPPLIER_EMAIL')
        expect(schema.requiredHeaders).toContain('SUPPLIER_PHONE_NUMBER')
        expect(schema.requiredHeaders).toContain(
          'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER'
        )
        expect(schema.requiredHeaders).toContain('YOUR_REFERENCE')
        expect(schema.requiredHeaders).toContain('WEIGHBRIDGE_TICKET')
        expect(schema.requiredHeaders).toContain('CARRIER_NAME')
        expect(schema.requiredHeaders).toContain('CBD_REG_NUMBER')
        expect(schema.requiredHeaders).toContain(
          'CARRIER_VEHICLE_REGISTRATION_NUMBER'
        )
      })

      it('has exactly 25 required headers (14 waste balance + 11 supplementary)', () => {
        expect(schema.requiredHeaders).toHaveLength(25)
      })
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

    describe('fatalFields (data validation - waste balance fields only)', () => {
      it('contains waste balance fields that cause fatal errors on validation failure', () => {
        expect(Array.isArray(schema.fatalFields)).toBe(true)
        expect(schema.fatalFields).toContain('ROW_ID')
        expect(schema.fatalFields).toContain('DATE_RECEIVED_FOR_REPROCESSING')
        expect(schema.fatalFields).toContain('EWC_CODE')
        expect(schema.fatalFields).toContain('DESCRIPTION_WASTE')
        expect(schema.fatalFields).toContain(
          'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE'
        )
        expect(schema.fatalFields).toContain('GROSS_WEIGHT')
        expect(schema.fatalFields).toContain('TARE_WEIGHT')
        expect(schema.fatalFields).toContain('PALLET_WEIGHT')
        expect(schema.fatalFields).toContain('NET_WEIGHT')
        expect(schema.fatalFields).toContain('BAILING_WIRE_PROTOCOL')
        expect(schema.fatalFields).toContain(
          'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION'
        )
        expect(schema.fatalFields).toContain('WEIGHT_OF_NON_TARGET_MATERIALS')
        expect(schema.fatalFields).toContain('RECYCLABLE_PROPORTION_PERCENTAGE')
        expect(schema.fatalFields).toContain('TONNAGE_RECEIVED_FOR_RECYCLING')
      })

      it('has exactly 14 fatal fields (waste balance columns only)', () => {
        expect(schema.fatalFields).toHaveLength(14)
      })

      it('does NOT contain supplementary columns from Sections 2 & 3', () => {
        expect(schema.fatalFields).not.toContain('SUPPLIER_NAME')
        expect(schema.fatalFields).not.toContain('SUPPLIER_ADDRESS')
        expect(schema.fatalFields).not.toContain('YOUR_REFERENCE')
        expect(schema.fatalFields).not.toContain('WEIGHBRIDGE_TICKET')
        expect(schema.fatalFields).not.toContain('CARRIER_NAME')
        expect(schema.fatalFields).not.toContain('CBD_REG_NUMBER')
      })
    })

    describe('fieldsRequiredForWasteBalance (VAL011)', () => {
      it('contains fields required for waste balance calculation', () => {
        expect(Array.isArray(schema.fieldsRequiredForWasteBalance)).toBe(true)
        expect(schema.fieldsRequiredForWasteBalance).toContain('ROW_ID')
        expect(schema.fieldsRequiredForWasteBalance).toContain(
          'DATE_RECEIVED_FOR_REPROCESSING'
        )
        expect(schema.fieldsRequiredForWasteBalance).toContain('EWC_CODE')
        expect(schema.fieldsRequiredForWasteBalance).toContain(
          'DESCRIPTION_WASTE'
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
          'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION'
        )
        expect(schema.fieldsRequiredForWasteBalance).toContain(
          'WEIGHT_OF_NON_TARGET_MATERIALS'
        )
        expect(schema.fieldsRequiredForWasteBalance).toContain(
          'RECYCLABLE_PROPORTION_PERCENTAGE'
        )
        expect(schema.fieldsRequiredForWasteBalance).toContain(
          'TONNAGE_RECEIVED_FOR_RECYCLING'
        )
      })

      it('has exactly 14 fields required for waste balance', () => {
        expect(schema.fieldsRequiredForWasteBalance).toHaveLength(14)
      })

      it('does NOT contain supplementary columns from Sections 2 & 3', () => {
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'SUPPLIER_NAME'
        )
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'YOUR_REFERENCE'
        )
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'CARRIER_NAME'
        )
      })
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
      it('accepts valid EWC code from allowed list', () => {
        const { error } = validationSchema.validate({ EWC_CODE: '03 03 08' })
        expect(error).toBeUndefined()
      })

      it('accepts valid EWC code with asterisk suffix from allowed list', () => {
        const { error } = validationSchema.validate({ EWC_CODE: '01 03 04*' })
        expect(error).toBeUndefined()
      })

      it('accepts other valid EWC codes from allowed list', () => {
        // Test a sample of valid codes from different categories
        const validCodes = ['15 01 01', '15 01 02', '20 01 01', '19 12 07']
        for (const code of validCodes) {
          const { error } = validationSchema.validate({ EWC_CODE: code })
          expect(error).toBeUndefined()
        }
      })

      it('rejects invalid EWC code format', () => {
        const { error } = validationSchema.validate({ EWC_CODE: '030308' })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid EWC code from the allowed list'
        )
      })

      it('rejects EWC code not in allowed list', () => {
        // Valid format but not in the allowed EWC codes list
        const { error } = validationSchema.validate({ EWC_CODE: '99 99 99' })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid EWC code from the allowed list'
        )
      })

      it('rejects non-string EWC code', () => {
        const { error } = validationSchema.validate({ EWC_CODE: 123456 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid EWC code from the allowed list'
        )
      })
    })

    describe('DESCRIPTION_WASTE validation', () => {
      it('accepts valid waste description from allowed list', () => {
        const { error } = validationSchema.validate({
          DESCRIPTION_WASTE: 'Aluminium - other'
        })
        expect(error).toBeUndefined()
      })

      it('accepts waste description with percentage value', () => {
        const { error } = validationSchema.validate({
          DESCRIPTION_WASTE:
            'Aluminium - AAIG aluminium cans and associated packaging (97.5%)'
        })
        expect(error).toBeUndefined()
      })

      it('accepts waste description with special characters', () => {
        // Note: This uses en-dash (–) not hyphen (-)
        const { error } = validationSchema.validate({
          DESCRIPTION_WASTE:
            'Steel – AAIG steel cans and associated packaging, grade 6E (97.5%)'
        })
        expect(error).toBeUndefined()
      })

      it('accepts various valid waste descriptions from allowed list', () => {
        const validDescriptions = [
          'Glass - pre-sorted',
          'Paper - other',
          'Plastic - PET bottles',
          'Wood - grade A',
          'Fibre-based composite - cups'
        ]
        for (const description of validDescriptions) {
          const { error } = validationSchema.validate({
            DESCRIPTION_WASTE: description
          })
          expect(error).toBeUndefined()
        }
      })

      it('rejects invalid waste description', () => {
        const { error } = validationSchema.validate({
          DESCRIPTION_WASTE: 'Invalid waste type'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid waste description from the allowed list'
        )
      })

      it('rejects waste description not in allowed list', () => {
        const { error } = validationSchema.validate({
          DESCRIPTION_WASTE: 'Copper - scrap'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid waste description from the allowed list'
        )
      })

      it('rejects non-string waste description', () => {
        const { error } = validationSchema.validate({
          DESCRIPTION_WASTE: 12345
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid waste description from the allowed list'
        )
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

    describe('HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION validation', () => {
      it('accepts "AAIG percentage"', () => {
        const { error } = validationSchema.validate({
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'AAIG percentage'
        })
        expect(error).toBeUndefined()
      })

      it('accepts "Actual weight (100%)"', () => {
        const { error } = validationSchema.validate({
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Actual weight (100%)'
        })
        expect(error).toBeUndefined()
      })

      it('accepts "National protocol percentage"', () => {
        const { error } = validationSchema.validate({
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION:
            'National protocol percentage'
        })
        expect(error).toBeUndefined()
      })

      it('accepts "S&I plan agreed methodology"', () => {
        const { error } = validationSchema.validate({
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION:
            'S&I plan agreed methodology'
        })
        expect(error).toBeUndefined()
      })

      it('accepts "S&I plan agreed site-specific protocol percentage"', () => {
        const { error } = validationSchema.validate({
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION:
            'S&I plan agreed site-specific protocol percentage'
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid method', () => {
        const { error } = validationSchema.validate({
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Some other method'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid recyclable proportion calculation method'
        )
      })

      it('rejects case variations', () => {
        const { error } = validationSchema.validate({
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'aaig percentage'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid recyclable proportion calculation method'
        )
      })

      it('rejects non-string', () => {
        const { error } = validationSchema.validate({
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 123
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid recyclable proportion calculation method'
        )
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
        expect(error.details[0].type).toBe(
          'custom.netWeightCalculationMismatch'
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
        expect(error.details[0].type).toBe(
          'custom.netWeightCalculationMismatch'
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

    describe('TONNAGE_RECEIVED_FOR_RECYCLING calculation validation', () => {
      it('accepts correct calculation without bailing wire ((100 - 10) * 0.8 = 72)', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'No',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_RECYCLING: 72
        })
        expect(error).toBeUndefined()
      })

      it('accepts correct calculation with bailing wire deduction ((100 - 10) * 0.9985 * 0.8 = 71.892)', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'Yes',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_RECYCLING: 71.892
        })
        expect(error).toBeUndefined()
      })

      it('accepts 100% recyclable with bailing wire ((100 - 0) * 0.9985 * 1 = 99.85)', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 0,
          BAILING_WIRE_PROTOCOL: 'Yes',
          RECYCLABLE_PROPORTION_PERCENTAGE: 1,
          TONNAGE_RECEIVED_FOR_RECYCLING: 99.85
        })
        expect(error).toBeUndefined()
      })

      it('rejects incorrect calculation', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'No',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_RECYCLING: 80 // Should be 72
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must equal the calculated tonnage based on NET_WEIGHT, WEIGHT_OF_NON_TARGET_MATERIALS, BAILING_WIRE_PROTOCOL, and RECYCLABLE_PROPORTION_PERCENTAGE'
        )
      })

      it('rejects calculation without bailing wire deduction when protocol is Yes', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'Yes',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_RECYCLING: 72 // Wrong - should be 71.892
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must equal the calculated tonnage based on NET_WEIGHT, WEIGHT_OF_NON_TARGET_MATERIALS, BAILING_WIRE_PROTOCOL, and RECYCLABLE_PROPORTION_PERCENTAGE'
        )
      })

      it('skips calculation check when TONNAGE_RECEIVED_FOR_RECYCLING is missing', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'No',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8
        })
        expect(error).toBeUndefined()
      })

      it('skips calculation check when NET_WEIGHT is missing', () => {
        const { error } = validationSchema.validate({
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'No',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_RECYCLING: 72
        })
        expect(error).toBeUndefined()
      })

      it('skips calculation check when BAILING_WIRE_PROTOCOL is missing', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_RECYCLING: 72
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
