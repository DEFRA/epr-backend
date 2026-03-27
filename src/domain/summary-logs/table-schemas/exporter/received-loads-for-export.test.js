import { describe, expect, it } from 'vitest'
import { RECEIVED_LOADS_FOR_EXPORT } from './received-loads-for-export.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import { CLASSIFICATION_REASON } from '../shared/classify-helpers.js'
import { ORS_VALIDATION_DISABLED } from '../shared/classification-reason.js'

describe('RECEIVED_LOADS_FOR_EXPORT', () => {
  const schema = RECEIVED_LOADS_FOR_EXPORT

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has wasteRecordType set to EXPORTED', () => {
      expect(schema.wasteRecordType).toBe(WASTE_RECORD_TYPE.EXPORTED)
    })

    it('has sheetName set to Exported', () => {
      expect(schema.sheetName).toBe('Exported')
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

    describe('CUSTOMS_CODES validation (free text)', () => {
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

      it('accepts code with spaces and hyphens', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'ABC-123 DEF'
        })
        expect(error).toBeUndefined()
      })

      it('accepts code with common punctuation', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'HS:8501.10/20'
        })
        expect(error).toBeUndefined()
      })

      it('accepts code with smart quotes and dashes', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: '\u2018code\u2019 \u2013 ref'
        })
        expect(error).toBeUndefined()
      })

      it('accepts code with pound and euro signs', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: '\u00A3100 \u20AC200'
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

      it('rejects code with accented characters', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'caf\u00E9'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must contain only permitted characters'
        )
      })

      it('rejects code with control characters', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'code\x00ref'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must contain only permitted characters'
        )
      })
    })

    describe('CONTAINER_NUMBER validation (free text - PAE-1124)', () => {
      it('accepts valid alphanumeric container number', () => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: 'ABCD1234567'
        })
        expect(error).toBeUndefined()
      })

      it('accepts container number with hyphens and spaces', () => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: 'ABCD-1234567 / TRLR-001'
        })
        expect(error).toBeUndefined()
      })

      it('accepts container number with smart quotes and dashes', () => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: '\u2018CONT\u2019 \u2013 123'
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

      it('rejects container number with accented characters', () => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: 'caf\u00E9-container'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must contain only permitted characters'
        )
      })

      it('rejects container number with control characters', () => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: 'CONT\x00123'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          'must contain only permitted characters'
        )
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

  describe('classifyForWasteBalance', () => {
    const accreditation = {
      validFrom: '2024-01-01',
      validTo: '2024-12-31',
      statusHistory: [
        { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' }
      ]
    }

    const completeRow = {
      ROW_ID: 1000,
      DATE_RECEIVED_FOR_EXPORT: new Date('2024-01-10'),
      EWC_CODE: '03 03 08',
      DESCRIPTION_WASTE: 'Paper - other',
      WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
      GROSS_WEIGHT: 100,
      TARE_WEIGHT: 5,
      PALLET_WEIGHT: 5,
      NET_WEIGHT: 90,
      BAILING_WIRE_PROTOCOL: 'No',
      HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'AAIG percentage',
      WEIGHT_OF_NON_TARGET_MATERIALS: 10,
      RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
      TONNAGE_RECEIVED_FOR_EXPORT: 72,
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 60.5,
      DATE_OF_EXPORT: new Date('2024-06-15'),
      BASEL_EXPORT_CODE: 'B1010',
      CUSTOMS_CODES: 'HS123',
      CONTAINER_NUMBER: 'CONT001',
      DATE_RECEIVED_BY_OSR: new Date('2024-06-20'),
      OSR_ID: 100,
      DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No'
    }

    describe('INCLUDED outcome - direct export (no interim site)', () => {
      it('returns INCLUDED with TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
        expect(result.transactionAmount).toBe(60.5)
      })

      it('rounds transaction amount to two decimal places', () => {
        const row = {
          ...completeRow,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 60.555
        }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.transactionAmount).toBe(60.56)
      })
    })

    describe('INCLUDED outcome - interim site', () => {
      it('uses TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR when waste passed through interim site', () => {
        const row = {
          ...completeRow,
          DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'Yes',
          TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: 45.75
        }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.transactionAmount).toBe(45.75)
      })
    })

    describe('EXCLUDED outcome - missing required fields', () => {
      it('returns EXCLUDED when a required field is missing', () => {
        const row = { ...completeRow }
        delete row.DATE_OF_EXPORT
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD,
          field: 'DATE_OF_EXPORT'
        })
      })

      it('returns EXCLUDED with all missing fields listed', () => {
        const result = schema.classifyForWasteBalance(
          {},
          { accreditation, overseasSites: ORS_VALIDATION_DISABLED }
        )
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toHaveLength(22)
      })

      it('returns EXCLUDED when required field is null', () => {
        const row = {
          ...completeRow,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: null
        }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
      })

      it('returns EXCLUDED when dropdown field has placeholder value', () => {
        const row = { ...completeRow, BAILING_WIRE_PROTOCOL: 'Choose option' }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
      })
    })

    describe('IGNORED outcome - date outside accreditation', () => {
      it('returns IGNORED when DATE_OF_EXPORT is before accreditation period', () => {
        const row = { ...completeRow, DATE_OF_EXPORT: new Date('2023-12-31') }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
        })
      })

      it('returns IGNORED when DATE_OF_EXPORT is after accreditation period', () => {
        const row = { ...completeRow, DATE_OF_EXPORT: new Date('2025-01-01') }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
      })

      it('returns INCLUDED when DATE_OF_EXPORT is on accreditation start boundary', () => {
        const row = { ...completeRow, DATE_OF_EXPORT: new Date('2024-01-01') }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })

      it('returns INCLUDED when DATE_OF_EXPORT is on accreditation end boundary', () => {
        const row = { ...completeRow, DATE_OF_EXPORT: new Date('2024-12-31') }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })
    })

    describe('EXCLUDED outcome - PRN issued', () => {
      it('returns EXCLUDED when PRN was issued', () => {
        const row = {
          ...completeRow,
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'Yes'
        }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.PRN_ISSUED
        })
      })
    })

    describe('EXCLUDED outcome - ORS not approved (VAL014)', () => {
      const approvedOverseasSites = {
        100: { validFrom: new Date('2024-01-01') }
      }

      it('returns INCLUDED when ORS is approved and validFrom is before DATE_OF_EXPORT', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: approvedOverseasSites
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })

      it('returns INCLUDED when ORS validFrom equals DATE_OF_EXPORT', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: {
            100: { validFrom: new Date('2024-06-15') }
          }
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })

      it('returns EXCLUDED when OSR_ID is not in overseasSites map', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: {
            200: { validFrom: new Date('2024-01-01') }
          }
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.ORS_NOT_APPROVED
        })
      })

      it('returns EXCLUDED when ORS has no validFrom date', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: {
            100: { validFrom: null }
          }
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.ORS_NOT_APPROVED
        })
      })

      it('returns EXCLUDED when ORS validFrom is after DATE_OF_EXPORT', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: {
            100: { validFrom: new Date('2024-07-01') }
          }
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.ORS_NOT_APPROVED
        })
      })

      it('returns EXCLUDED when overseasSites map is empty', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: {}
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.ORS_NOT_APPROVED
        })
      })

      it('skips ORS check when ORS validation is disabled', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })
    })

    describe('INCLUDED outcome - undefined or null accreditation', () => {
      it('returns INCLUDED when accreditation is undefined (accreditation check passes)', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: undefined,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
      })

      it('returns INCLUDED when accreditation is null (accreditation check passes)', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: null,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
      })

      it('returns INCLUDED when accreditation has empty statusHistory', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: {
            validFrom: '2024-01-01',
            validTo: '2024-12-31',
            statusHistory: []
          },
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
      })
    })

    describe('IGNORED outcome - suspended accreditation', () => {
      it('returns IGNORED when accreditation was suspended before the row date', () => {
        const suspendedAccreditation = {
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          statusHistory: [
            { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' },
            { status: 'suspended', updatedAt: '2024-03-01T00:00:00.000Z' }
          ]
        }
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: suspendedAccreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
        })
      })

      it('returns INCLUDED when accreditation was suspended then re-approved before the row date', () => {
        const reapprovedAccreditation = {
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          statusHistory: [
            { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' },
            { status: 'suspended', updatedAt: '2024-03-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2024-04-01T00:00:00.000Z' }
          ]
        }
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: reapprovedAccreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })

      it('returns IGNORED when DATE_OF_EXPORT is in suspended period but DATE_RECEIVED_BY_OSR is approved', () => {
        const row = {
          ...completeRow,
          DATE_OF_EXPORT: new Date('2024-05-15'),
          DATE_RECEIVED_BY_OSR: new Date('2024-07-15')
        }
        const suspendedAccreditation = {
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          statusHistory: [
            { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' },
            { status: 'suspended', updatedAt: '2024-04-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2024-07-01T00:00:00.000Z' }
          ]
        }
        const result = schema.classifyForWasteBalance(row, {
          accreditation: suspendedAccreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
        })
      })

      it('returns IGNORED when DATE_RECEIVED_BY_OSR is in suspended period but DATE_OF_EXPORT is approved', () => {
        const row = {
          ...completeRow,
          DATE_OF_EXPORT: new Date('2024-03-15'),
          DATE_RECEIVED_BY_OSR: new Date('2024-05-15')
        }
        const suspendedAccreditation = {
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          statusHistory: [
            { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' },
            { status: 'suspended', updatedAt: '2024-04-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2024-07-01T00:00:00.000Z' }
          ]
        }
        const result = schema.classifyForWasteBalance(row, {
          accreditation: suspendedAccreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
        })
      })

      it('returns INCLUDED when both DATE_OF_EXPORT and DATE_RECEIVED_BY_OSR are in approved period', () => {
        const row = {
          ...completeRow,
          DATE_OF_EXPORT: new Date('2024-08-15'),
          DATE_RECEIVED_BY_OSR: new Date('2024-09-01')
        }
        const reapprovedAccreditation = {
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          statusHistory: [
            { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' },
            { status: 'suspended', updatedAt: '2024-04-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2024-07-01T00:00:00.000Z' }
          ]
        }
        const result = schema.classifyForWasteBalance(row, {
          accreditation: reapprovedAccreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })
    })

    describe('classification priority', () => {
      it('checks required fields before date range', () => {
        const result = schema.classifyForWasteBalance(
          {},
          { accreditation, overseasSites: ORS_VALIDATION_DISABLED }
        )
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons[0].code).toBe(
          CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD
        )
      })

      it('checks date range before PRN', () => {
        const row = {
          ...completeRow,
          DATE_OF_EXPORT: new Date('2023-01-01'),
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'Yes'
        }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: ORS_VALIDATION_DISABLED
        })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
      })

      it('checks ORS approval before PRN', () => {
        const row = {
          ...completeRow,
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'Yes'
        }
        const result = schema.classifyForWasteBalance(row, {
          accreditation,
          overseasSites: {}
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.ORS_NOT_APPROVED
        })
      })
    })
  })
})
