import { describe, expect, it } from 'vitest'
import { RECEIVED_LOADS_FOR_EXPORT } from './received-loads-for-export.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import { CLASSIFICATION_REASON } from '../shared/classify-helpers.js'
import { ORS_VALIDATION_DISABLED } from '../shared/classification-reason.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {OverseasSitesContext} from '../validation-pipeline.js' */

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
        expect(error?.details[0].message).toBe('must be at least 1000')
      })

      it('rejects non-integer ROW_ID', () => {
        const { error } = validationSchema.validate({ ROW_ID: 1000.5 })
        expect(error).toBeDefined()
      })
    })

    describe('Date field validations', () => {
      const dateFields = [
        'DATE_RECEIVED_FOR_EXPORT',
        'DATE_OF_EXPORT',
        'DATE_RECEIVED_BY_OSR'
      ]

      it.each(dateFields)('%s accepts valid Date object', (field) => {
        const { error } = validationSchema.validate({
          [field]: new Date('2024-01-15')
        })
        expect(error).toBeUndefined()
      })

      it.each(dateFields)('%s rejects invalid date string', (field) => {
        const { error } = validationSchema.validate({ [field]: 'not-a-date' })
        expect(error).toBeDefined()
        expect(error?.details[0].message).toBe('must be a valid date')
      })

      it('accepts date string that can be parsed for DATE_RECEIVED_FOR_EXPORT', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_FOR_EXPORT: '2024-01-15'
        })
        expect(error).toBeUndefined()
      })
    })

    describe('EWC_CODE validation', () => {
      it.each([
        { code: '03 03 08', description: 'from allowed list' },
        {
          code: '01 03 04*',
          description: 'with asterisk suffix from allowed list'
        }
      ])('accepts valid EWC code $code ($description)', ({ code }) => {
        const { error } = validationSchema.validate({ EWC_CODE: code })

        expect(error).toBeUndefined()
      })

      it.each(['030308', '99 99 99'])('rejects invalid EWC code %s', (code) => {
        const { error } = validationSchema.validate({ EWC_CODE: code })
        expect(error).toBeDefined()
        expect(error?.details[0].message).toBe(
          'must be a valid EWC code from the allowed list'
        )
      })
    })

    describe('DESCRIPTION_WASTE validation', () => {
      it.each([
        'Aluminium - other',
        'Aluminium - AAIG aluminium cans and associated packaging (97.5%)'
      ])('accepts valid waste description %s', (value) => {
        const { error } = validationSchema.validate({
          DESCRIPTION_WASTE: value
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid waste description', () => {
        const { error } = validationSchema.validate({
          DESCRIPTION_WASTE: 'Invalid waste type'
        })
        expect(error).toBeDefined()
        expect(error?.details[0].message).toBe(
          'must be a valid waste description from the allowed list'
        )
      })
    })

    describe('BASEL_EXPORT_CODE validation', () => {
      it.each(['B1010', 'GB040', 'A1010', 'Y46'])(
        'accepts valid Basel code %s',
        (code) => {
          const { error } = validationSchema.validate({
            BASEL_EXPORT_CODE: code
          })
          expect(error).toBeUndefined()
        }
      )

      it.each(['INVALID', 'Z9999'])(
        'rejects Basel code %s not in allowed list',
        (code) => {
          const { error } = validationSchema.validate({
            BASEL_EXPORT_CODE: code
          })
          expect(error).toBeDefined()
          expect(error?.details[0].message).toBe(
            'must be a valid Basel export code from the allowed list'
          )
        }
      )
    })

    describe('EXPORT_CONTROLS validation', () => {
      it.each([
        'Article 18 (Green list)',
        'Prior informed consent (notification controls)'
      ])('accepts "%s"', (value) => {
        const { error } = validationSchema.validate({
          EXPORT_CONTROLS: value
        })
        expect(error).toBeUndefined()
      })

      it.each(['Some other control', 'article 18 (green list)'])(
        'rejects invalid export control value %s',
        (value) => {
          const { error } = validationSchema.validate({
            EXPORT_CONTROLS: value
          })
          expect(error).toBeDefined()
          expect(error?.details[0].message).toBe(
            'must be a valid export control type from the allowed list'
          )
        }
      )
    })

    describe('CUSTOMS_CODES validation (free text)', () => {
      it.each([
        { code: 'ABCD012345679', description: 'alphanumeric code' },
        { code: '1234567890', description: 'numeric only code' },
        { code: 'ABCDEFGH', description: 'alpha only code' },
        { code: 'ABC-123 DEF', description: 'code with spaces and hyphens' },
        { code: 'HS:8501.10/20', description: 'code with common punctuation' },
        {
          code: '\u2018code\u2019 \u2013 ref',
          description: 'code with smart quotes and dashes'
        },
        {
          code: '\u00A3100 \u20AC200',
          description: 'code with pound and euro signs'
        },
        {
          code: 'A'.repeat(100),
          description: 'code at maximum length (100 chars)'
        }
      ])('accepts $description ($code)', ({ code }) => {
        const { error } = validationSchema.validate({ CUSTOMS_CODES: code })

        expect(error).toBeUndefined()
      })

      it('rejects code exceeding maximum length', () => {
        const { error } = validationSchema.validate({
          CUSTOMS_CODES: 'A'.repeat(101)
        })
        expect(error).toBeDefined()
        expect(error?.details[0].message).toBe('must be at most 100 characters')
      })

      it.each(['caf\u00E9', 'code\x00ref'])(
        'rejects code with disallowed characters %s',
        (code) => {
          const { error } = validationSchema.validate({ CUSTOMS_CODES: code })
          expect(error).toBeDefined()
          expect(error?.details[0].message).toBe(
            'must contain only permitted characters'
          )
        }
      )
    })

    describe('CONTAINER_NUMBER validation (free text - PAE-1124)', () => {
      it.each([
        'ABCD1234567',
        'ABCD-1234567 / TRLR-001',
        '\u2018CONT\u2019 \u2013 123',
        'A'.repeat(100)
      ])('accepts container number %s', (value) => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: value
        })
        expect(error).toBeUndefined()
      })

      it('rejects container number exceeding maximum length', () => {
        const { error } = validationSchema.validate({
          CONTAINER_NUMBER: 'A'.repeat(101)
        })
        expect(error).toBeDefined()
        expect(error?.details[0].message).toBe('must be at most 100 characters')
      })

      it.each(['caf\u00E9-container', 'CONT\x00123'])(
        'rejects container number with disallowed characters %s',
        (value) => {
          const { error } = validationSchema.validate({
            CONTAINER_NUMBER: value
          })
          expect(error).toBeDefined()
          expect(error?.details[0].message).toBe(
            'must contain only permitted characters'
          )
        }
      )
    })

    describe('OSR_ID validation (zero-padded 3-digit string)', () => {
      it.each([1, 999, 500])('accepts value %i within range', (value) => {
        const { error } = validationSchema.validate({ OSR_ID: value })
        expect(error).toBeUndefined()
      })

      it.each([
        { value: 0, reason: 'below minimum' },
        { value: 1000, reason: 'above maximum' },
        { value: 'ABC', reason: 'non-numeric' }
      ])('rejects $reason value ($value)', ({ value }) => {
        const { error } = validationSchema.validate({ OSR_ID: value })

        expect(error).toBeDefined()
        expect(error?.details[0].message).toBe('must be a 3-digit ID (001-999)')
      })

      it('rejects non-integer', () => {
        const { error } = validationSchema.validate({ OSR_ID: 100.5 })
        expect(error).toBeDefined()
      })
    })

    describe('INTERIM_SITE_ID validation (zero-padded 3-digit string)', () => {
      it.each([1, 999])('accepts value %i within range', (value) => {
        const { error } = validationSchema.validate({ INTERIM_SITE_ID: value })
        expect(error).toBeUndefined()
      })

      it.each([0, 1000])('rejects value %i outside range', (value) => {
        const { error } = validationSchema.validate({ INTERIM_SITE_ID: value })
        expect(error).toBeDefined()
        expect(error?.details[0].message).toBe('must be a 3-digit ID (001-999)')
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
            expect(error?.details[0].message).toBe('must be at least 0')
          })

          it('rejects value above maximum (1000)', () => {
            const { error } = validationSchema.validate({ [field]: 1001 })
            expect(error).toBeDefined()
            expect(error?.details[0].message).toBe('must be at most 1000')
          })

          it('rejects non-number', () => {
            const { error } = validationSchema.validate({ [field]: 'heavy' })
            expect(error).toBeDefined()
            expect(error?.details[0].message).toBe('must be a number')
          })
        })
      }
    })

    describe('RECYCLABLE_PROPORTION_PERCENTAGE validation', () => {
      it.each([0, 1, 0.5])('accepts value %f within range', (value) => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: value
        })
        expect(error).toBeUndefined()
      })

      it.each([
        [-0.1, 'must be at least 0'],
        [1.1, 'must be at most 1']
      ])('rejects value %f with message "%s"', (value, message) => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: value
        })
        expect(error).toBeDefined()
        expect(error?.details[0].message).toBe(message)
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
            expect(error?.details[0].message).toBe('must be Yes or No')
          })

          it('rejects other strings', () => {
            const { error } = validationSchema.validate({ [field]: 'Maybe' })
            expect(error).toBeDefined()
            expect(error?.details[0].message).toBe('must be Yes or No')
          })
        })
      }
    })

    describe('HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION validation', () => {
      it.each([
        'AAIG percentage',
        'Actual weight (100%)',
        'National protocol percentage',
        'S&I plan agreed methodology',
        'S&I plan agreed site-specific protocol percentage'
      ])('accepts "%s"', (value) => {
        const { error } = validationSchema.validate({
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: value
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid method', () => {
        const { error } = validationSchema.validate({
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Some other method'
        })
        expect(error).toBeDefined()
        expect(error?.details[0].message).toBe(
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
        expect(error?.details[0].message).toBe(
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
        expect(error?.details[0].message).toBe(
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
        expect(error?.details[0].message).toBe(
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
    const accreditation = /** @type {Accreditation} */ ({
      validFrom: '2024-01-01',
      validTo: '2024-12-31',
      statusHistory: [
        { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' }
      ]
    })

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
      OSR_ID: '001',
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
        expect(
          /** @type {{ transactionAmount: number }} */ (result)
            .transactionAmount
        ).toBe(60.5)
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
        expect(
          /** @type {{ transactionAmount: number }} */ (result)
            .transactionAmount
        ).toBe(60.56)
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
        expect(
          /** @type {{ transactionAmount: number }} */ (result)
            .transactionAmount
        ).toBe(45.75)
      })
    })

    describe('EXCLUDED outcome - missing required fields', () => {
      it('returns EXCLUDED when a required field is missing', () => {
        const row = /** @type {Record<string, any>} */ ({ ...completeRow })
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
      it.each(
        /** @type {{ description: string, overseasSites: OverseasSitesContext }[]} */ ([
          {
            description:
              'ORS is approved and validFrom is before DATE_OF_EXPORT',
            overseasSites: {
              '001': { validFrom: new Date('2024-01-01') }
            }
          },
          {
            description: 'ORS validFrom equals DATE_OF_EXPORT',
            overseasSites: { '001': { validFrom: new Date('2024-06-15') } }
          },
          {
            description: 'ORS validation is disabled',
            overseasSites: ORS_VALIDATION_DISABLED
          }
        ])
      )('returns INCLUDED when $description', ({ overseasSites }) => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })

      it('returns EXCLUDED when ORS has no validFrom date', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: {
            '001': { validFrom: null }
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
            '001': { validFrom: new Date('2024-07-01') }
          }
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.ORS_NOT_APPROVED
        })
      })
    })

    // VAL015 is distinct from VAL014: VAL014 covers a registered overseas site
    // whose approval does not yet cover the export date, whereas VAL015 covers
    // an OSR_ID absent from the registration's overseas sites, which resolves
    // to undefined and is excluded as ORS_NOT_FOUND.
    describe('EXCLUDED outcome - ORS not found (VAL015)', () => {
      it('returns EXCLUDED with ORS_NOT_FOUND when OSR_ID is not in overseasSites map', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: {
            '002': { validFrom: new Date('2024-01-01') }
          }
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.ORS_NOT_FOUND
        })
      })

      it('returns EXCLUDED with ORS_NOT_FOUND when overseasSites map is empty', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation,
          overseasSites: {}
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.ORS_NOT_FOUND
        })
      })
    })

    describe('INCLUDED outcome - null accreditation', () => {
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
          accreditation: /** @type {Accreditation} */ ({
            validFrom: '2024-01-01',
            validTo: '2024-12-31',
            statusHistory:
              /** @type {{ status: string, updatedAt: string }[]} */ ([])
          }),
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
          accreditation: /** @type {Accreditation} */ (suspendedAccreditation),
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
          accreditation: /** @type {Accreditation} */ (reapprovedAccreditation),
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
          accreditation: /** @type {Accreditation} */ (suspendedAccreditation),
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
          accreditation: /** @type {Accreditation} */ (suspendedAccreditation),
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
          accreditation: /** @type {Accreditation} */ (reapprovedAccreditation),
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
          overseasSites: {
            '001': { validFrom: null }
          }
        })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.ORS_NOT_APPROVED
        })
      })
    })
  })
})
