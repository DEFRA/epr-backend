import { describe, expect, it } from 'vitest'
import { RECEIVED_LOADS_FOR_EXPORT } from './received-loads-for-export.js'

describe('RECEIVED_LOADS_FOR_EXPORT', () => {
  const schema = RECEIVED_LOADS_FOR_EXPORT

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has requiredHeaders array with expected fields', () => {
      expect(schema.requiredHeaders).toContain('ROW_ID')
      expect(schema.requiredHeaders).toContain('DATE_RECEIVED_FOR_EXPORT')
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
      expect(schema.requiredHeaders).toContain('WEIGHT_OF_NON_TARGET_MATERIALS')
      expect(schema.requiredHeaders).toContain(
        'RECYCLABLE_PROPORTION_PERCENTAGE'
      )
      expect(schema.requiredHeaders).toContain('TONNAGE_RECEIVED_FOR_EXPORT')
      expect(schema.requiredHeaders).toContain(
        'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE'
      )
      expect(schema.requiredHeaders).toContain(
        'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'
      )
      expect(schema.requiredHeaders).toContain('DATE_OF_EXPORT')
      expect(schema.requiredHeaders).toContain('BASEL_EXPORT_CODE')
      expect(schema.requiredHeaders).toContain('CUSTOMS_CODES')
      expect(schema.requiredHeaders).toContain('CONTAINER_NUMBER')
      expect(schema.requiredHeaders).toContain('DATE_RECEIVED_BY_OSR')
      expect(schema.requiredHeaders).toContain('OSR_ID')
      expect(schema.requiredHeaders).toContain(
        'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE'
      )
      expect(schema.requiredHeaders).toContain('INTERIM_SITE_ID')
      expect(schema.requiredHeaders).toContain(
        'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR'
      )
      expect(schema.requiredHeaders).toContain('EXPORT_CONTROLS')
    })

    it('has unfilledValues object with dropdown placeholders', () => {
      expect(typeof schema.unfilledValues).toBe('object')
      expect(schema.unfilledValues.BAILING_WIRE_PROTOCOL).toContain(
        'Choose option'
      )
      expect(
        schema.unfilledValues.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
      ).toContain('Choose option')
      expect(
        schema.unfilledValues.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
      ).toContain('Choose option')
      expect(schema.unfilledValues.EXPORT_CONTROLS).toContain('Choose option')
      expect(schema.unfilledValues.BASEL_EXPORT_CODE).toContain('Choose option')
    })

    it('has fatalFields array with waste balance fields (not supplementary)', () => {
      expect(Array.isArray(schema.fatalFields)).toBe(true)
      expect(schema.fatalFields).toContain('ROW_ID')
      expect(schema.fatalFields).toContain('DATE_RECEIVED_FOR_EXPORT')
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
      expect(schema.fatalFields).toContain('TONNAGE_RECEIVED_FOR_EXPORT')
      expect(schema.fatalFields).toContain(
        'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'
      )
      expect(schema.fatalFields).toContain('DATE_OF_EXPORT')
      expect(schema.fatalFields).toContain('BASEL_EXPORT_CODE')
      expect(schema.fatalFields).toContain('CUSTOMS_CODES')
      expect(schema.fatalFields).toContain('CONTAINER_NUMBER')
      expect(schema.fatalFields).toContain('DATE_RECEIVED_BY_OSR')
      expect(schema.fatalFields).toContain('OSR_ID')
      expect(schema.fatalFields).toContain(
        'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE'
      )
      // Supplementary fields are NOT fatal
      expect(schema.fatalFields).not.toContain('INTERIM_SITE_ID')
      expect(schema.fatalFields).not.toContain(
        'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR'
      )
      expect(schema.fatalFields).not.toContain('EXPORT_CONTROLS')
    })

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      // Per PAE-984: Only business-mandated fields are required for waste balance.
      // Supplementary fields (EXPORT_CONTROLS, INTERIM_SITE_ID,
      // TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR) are not required.
      it('contains the 22 business-mandated fields for waste balance inclusion', () => {
        expect(
          Array.isArray(schema.fieldsRequiredForInclusionInWasteBalance)
        ).toBe(true)
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'ROW_ID'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'DATE_RECEIVED_FOR_EXPORT'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'EWC_CODE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'DESCRIPTION_WASTE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'GROSS_WEIGHT'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'TARE_WEIGHT'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'PALLET_WEIGHT'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'NET_WEIGHT'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'BAILING_WIRE_PROTOCOL'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'WEIGHT_OF_NON_TARGET_MATERIALS'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'RECYCLABLE_PROPORTION_PERCENTAGE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'TONNAGE_RECEIVED_FOR_EXPORT'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'DATE_OF_EXPORT'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'BASEL_EXPORT_CODE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'CUSTOMS_CODES'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'CONTAINER_NUMBER'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'DATE_RECEIVED_BY_OSR'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'OSR_ID'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE'
        )
      })

      it('does NOT include supplementary fields (audit/conditional)', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'INTERIM_SITE_ID'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'EXPORT_CONTROLS'
        )
      })

      it('has exactly 22 fields required for waste balance (per PAE-984)', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toHaveLength(22)
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

    describe('DATE_RECEIVED_FOR_EXPORT validation', () => {
      it('accepts valid Date object', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_FOR_EXPORT: new Date('2024-01-15')
        })
        expect(error).toBeUndefined()
      })

      it('accepts date string that can be parsed', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_FOR_EXPORT: '2024-01-15'
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid date string', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_FOR_EXPORT: 'not-a-date'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a valid date')
      })
    })

    describe('DATE_OF_EXPORT validation', () => {
      it('accepts valid Date object', () => {
        const { error } = validationSchema.validate({
          DATE_OF_EXPORT: new Date('2024-01-20')
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid date string', () => {
        const { error } = validationSchema.validate({
          DATE_OF_EXPORT: 'not-a-date'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a valid date')
      })
    })

    describe('DATE_RECEIVED_BY_OSR validation', () => {
      it('accepts valid Date object', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_BY_OSR: new Date('2024-01-25')
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid date string', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_BY_OSR: 'not-a-date'
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

      it('rejects invalid EWC code format', () => {
        const { error } = validationSchema.validate({ EWC_CODE: '030308' })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid EWC code from the allowed list'
        )
      })

      it('rejects EWC code not in allowed list', () => {
        const { error } = validationSchema.validate({ EWC_CODE: '99 99 99' })
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

      it('rejects invalid waste description', () => {
        const { error } = validationSchema.validate({
          DESCRIPTION_WASTE: 'Invalid waste type'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid waste description from the allowed list'
        )
      })
    })

    describe('BASEL_EXPORT_CODE validation', () => {
      it('accepts valid Basel code B1010', () => {
        const { error } = validationSchema.validate({
          BASEL_EXPORT_CODE: 'B1010'
        })
        expect(error).toBeUndefined()
      })

      it('accepts valid Basel code GB040', () => {
        const { error } = validationSchema.validate({
          BASEL_EXPORT_CODE: 'GB040'
        })
        expect(error).toBeUndefined()
      })

      it('accepts valid Basel code A1010', () => {
        const { error } = validationSchema.validate({
          BASEL_EXPORT_CODE: 'A1010'
        })
        expect(error).toBeUndefined()
      })

      it('accepts valid Basel code Y46', () => {
        const { error } = validationSchema.validate({
          BASEL_EXPORT_CODE: 'Y46'
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid Basel code', () => {
        const { error } = validationSchema.validate({
          BASEL_EXPORT_CODE: 'INVALID'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid Basel export code from the allowed list'
        )
      })

      it('rejects Basel code not in allowed list', () => {
        const { error } = validationSchema.validate({
          BASEL_EXPORT_CODE: 'Z9999'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid Basel export code from the allowed list'
        )
      })
    })

    describe('EXPORT_CONTROLS validation', () => {
      it('accepts "Article 18 (Green list)"', () => {
        const { error } = validationSchema.validate({
          EXPORT_CONTROLS: 'Article 18 (Green list)'
        })
        expect(error).toBeUndefined()
      })

      it('accepts "Prior informed consent (notification controls)"', () => {
        const { error } = validationSchema.validate({
          EXPORT_CONTROLS: 'Prior informed consent (notification controls)'
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid export control value', () => {
        const { error } = validationSchema.validate({
          EXPORT_CONTROLS: 'Some other control'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid export control type from the allowed list'
        )
      })

      it('rejects case variations', () => {
        const { error } = validationSchema.validate({
          EXPORT_CONTROLS: 'article 18 (green list)'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a valid export control type from the allowed list'
        )
      })
    })

    describe('CUSTOMS_CODES validation', () => {
      it('accepts valid alphanumeric code', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'ABCD012345679'
        })
        expect(error).toBeUndefined()
      })

      it('accepts numeric only code', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: '1234567890'
        })
        expect(error).toBeUndefined()
      })

      it('accepts alpha only code', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'ABCDEFGH'
        })
        expect(error).toBeUndefined()
      })

      it('accepts code at maximum length (100 chars)', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'A'.repeat(100)
        })
        expect(error).toBeUndefined()
      })

      it('rejects code exceeding maximum length', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'A'.repeat(101)
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 100 characters')
      })

      it('rejects code with special characters', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'ABC-123'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be alphanumeric')
      })

      it('rejects code with spaces', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'ABC 123'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be alphanumeric')
      })
    })

    describe('CONTAINER_NUMBER validation', () => {
      it('accepts valid alphanumeric container number', () => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: 'ABCD1234567'
        })
        expect(error).toBeUndefined()
      })

      it('accepts container number at maximum length (100 chars)', () => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: 'A'.repeat(100)
        })
        expect(error).toBeUndefined()
      })

      it('rejects container number exceeding maximum length', () => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: 'A'.repeat(101)
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 100 characters')
      })

      it('rejects container number with special characters', () => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: 'ABCD-1234567'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be alphanumeric')
      })
    })

    describe('OSR_ID validation (3-digit number)', () => {
      it('accepts minimum value (1)', () => {
        const { error } = validationSchema.validate({ OSR_ID: 1 })
        expect(error).toBeUndefined()
      })

      it('accepts maximum value (999)', () => {
        const { error } = validationSchema.validate({ OSR_ID: 999 })
        expect(error).toBeUndefined()
      })

      it('accepts value in middle of range', () => {
        const { error } = validationSchema.validate({ OSR_ID: 500 })
        expect(error).toBeUndefined()
      })

      it('rejects value below minimum (0)', () => {
        const { error } = validationSchema.validate({ OSR_ID: 0 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a number between 1 and 999'
        )
      })

      it('rejects value above maximum (1000)', () => {
        const { error } = validationSchema.validate({ OSR_ID: 1000 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a number between 1 and 999'
        )
      })

      it('rejects non-integer', () => {
        const { error } = validationSchema.validate({ OSR_ID: 100.5 })
        expect(error).toBeDefined()
      })

      it('rejects non-number', () => {
        const { error } = validationSchema.validate({ OSR_ID: 'ABC' })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('INTERIM_SITE_ID validation (3-digit number)', () => {
      it('accepts minimum value (1)', () => {
        const { error } = validationSchema.validate({ INTERIM_SITE_ID: 1 })
        expect(error).toBeUndefined()
      })

      it('accepts maximum value (999)', () => {
        const { error } = validationSchema.validate({ INTERIM_SITE_ID: 999 })
        expect(error).toBeUndefined()
      })

      it('rejects value below minimum (0)', () => {
        const { error } = validationSchema.validate({ INTERIM_SITE_ID: 0 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a number between 1 and 999'
        )
      })

      it('rejects value above maximum (1000)', () => {
        const { error } = validationSchema.validate({ INTERIM_SITE_ID: 1000 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must be a number between 1 and 999'
        )
      })
    })

    describe('Weight field validations', () => {
      const weightFields = [
        'GROSS_WEIGHT',
        'TARE_WEIGHT',
        'PALLET_WEIGHT',
        'NET_WEIGHT',
        'WEIGHT_OF_NON_TARGET_MATERIALS',
        'TONNAGE_RECEIVED_FOR_EXPORT',
        'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
        'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR'
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
            const { error } = validationSchema.validate({ [field]: 'heavy' })
            expect(error).toBeDefined()
            expect(error.details[0].message).toBe('must be a number')
          })
        })
      }
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
    })

    describe('Yes/No field validations', () => {
      const yesNoFields = [
        'BAILING_WIRE_PROTOCOL',
        'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
        'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE'
      ]

      for (const field of yesNoFields) {
        describe(`${field} validation`, () => {
          it('accepts "Yes"', () => {
            const { error } = validationSchema.validate({ [field]: 'Yes' })
            expect(error).toBeUndefined()
          })

          it('accepts "No"', () => {
            const { error } = validationSchema.validate({ [field]: 'No' })
            expect(error).toBeUndefined()
          })

          it('rejects lowercase "yes"', () => {
            const { error } = validationSchema.validate({ [field]: 'yes' })
            expect(error).toBeDefined()
            expect(error.details[0].message).toBe('must be Yes or No')
          })

          it('rejects other strings', () => {
            const { error } = validationSchema.validate({ [field]: 'Maybe' })
            expect(error).toBeDefined()
            expect(error.details[0].message).toBe('must be Yes or No')
          })
        })
      }
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
    })

    describe('TONNAGE_RECEIVED_FOR_EXPORT calculation validation', () => {
      it('accepts correct calculation without bailing wire ((100 - 10) * 0.8 = 72)', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'No',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_EXPORT: 72
        })
        expect(error).toBeUndefined()
      })

      it('accepts correct calculation with bailing wire deduction ((100 - 10) * 0.9985 * 0.8 = 71.892)', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'Yes',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_EXPORT: 71.892
        })
        expect(error).toBeUndefined()
      })

      it('accepts 100% recyclable with bailing wire ((100 - 0) * 0.9985 * 1 = 99.85)', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 0,
          BAILING_WIRE_PROTOCOL: 'Yes',
          RECYCLABLE_PROPORTION_PERCENTAGE: 1,
          TONNAGE_RECEIVED_FOR_EXPORT: 99.85
        })
        expect(error).toBeUndefined()
      })

      it('rejects incorrect calculation', () => {
        const { error } = validationSchema.validate({
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'No',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_EXPORT: 80 // Should be 72
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
          TONNAGE_RECEIVED_FOR_EXPORT: 72 // Wrong - should be 71.892
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must equal the calculated tonnage based on NET_WEIGHT, WEIGHT_OF_NON_TARGET_MATERIALS, BAILING_WIRE_PROTOCOL, and RECYCLABLE_PROPORTION_PERCENTAGE'
        )
      })

      it('skips calculation check when TONNAGE_RECEIVED_FOR_EXPORT is missing', () => {
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
          TONNAGE_RECEIVED_FOR_EXPORT: 72
        })
        expect(error).toBeUndefined()
      })
    })
  })
})
