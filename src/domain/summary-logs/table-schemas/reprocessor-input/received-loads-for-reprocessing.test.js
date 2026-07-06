import { describe, expect, it } from 'vitest'
import { RECEIVED_LOADS_FOR_REPROCESSING } from './received-loads-for-reprocessing.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import { CLASSIFICATION_REASON } from '../shared/classify-helpers.js'
import { buildAccreditation } from '#repositories/organisations/contract/test-data.js'
import { expectValidationError } from '#common/validation/validation-test-helpers.js'

describe('RECEIVED_LOADS_FOR_REPROCESSING', () => {
  const schema = RECEIVED_LOADS_FOR_REPROCESSING

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has wasteRecordType set to RECEIVED', () => {
      expect(schema.wasteRecordType).toBe(WASTE_RECORD_TYPE.RECEIVED)
    })

    it('has sheetName set to Received', () => {
      expect(schema.sheetName).toBe('Received')
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
        const details = expectValidationError(validationSchema, {
          ROW_ID: 999
        })
        expect(details[0].message).toBe('must be at least 1000')
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
        const details = expectValidationError(validationSchema, {
          DATE_RECEIVED_FOR_REPROCESSING: 'not-a-date'
        })
        expect(details[0].message).toBe('must be a valid date')
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
        const details = expectValidationError(validationSchema, {
          EWC_CODE: '030308'
        })
        expect(details[0].message).toBe(
          'must be a valid EWC code from the allowed list'
        )
      })

      it('rejects EWC code not in allowed list', () => {
        // Valid format but not in the allowed EWC codes list
        const details = expectValidationError(validationSchema, {
          EWC_CODE: '99 99 99'
        })
        expect(details[0].message).toBe(
          'must be a valid EWC code from the allowed list'
        )
      })

      it('rejects non-string EWC code', () => {
        const details = expectValidationError(validationSchema, {
          EWC_CODE: 123456
        })
        expect(details[0].message).toBe(
          'must be a valid EWC code from the allowed list'
        )
      })
    })

    describe('DESCRIPTION_WASTE validation', () => {
      it.each([
        { description: 'Aluminium - other' },
        {
          description:
            'Aluminium - AAIG aluminium cans and associated packaging (97.5%)'
        },
        {
          // Note: This uses en-dash (–) not hyphen (-)
          description:
            'Steel – AAIG steel cans and associated packaging, grade 6E (97.5%)'
        }
      ])(
        'accepts valid waste description "$description"',
        ({ description }) => {
          const { error } = validationSchema.validate({
            DESCRIPTION_WASTE: description
          })
          expect(error).toBeUndefined()
        }
      )

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

      it.each([
        { label: 'invalid waste description', value: 'Invalid waste type' },
        {
          label: 'waste description not in allowed list',
          value: 'Copper - scrap'
        },
        { label: 'non-string waste description', value: 12345 }
      ])('rejects $label', ({ value }) => {
        const details = expectValidationError(validationSchema, {
          DESCRIPTION_WASTE: value
        })
        expect(details[0].message).toBe(
          'must be a valid waste description from the allowed list'
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
        'TONNAGE_RECEIVED_FOR_RECYCLING'
      ]

      for (const field of weightFields) {
        describe(`${field} validation`, () => {
          it.each([
            { label: 'zero', value: 0 },
            { label: 'maximum value (1000)', value: 1000 },
            { label: 'value within range', value: 500.5 }
          ])('accepts $label', ({ value }) => {
            const { error } = validationSchema.validate({ [field]: value })
            expect(error).toBeUndefined()
          })

          it.each([
            {
              label: 'negative value',
              value: -1,
              message: 'must be at least 0'
            },
            {
              label: 'value above maximum (1000)',
              value: 1001,
              message: 'must be at most 1000'
            },
            {
              label: 'non-number',
              value: 'not-a-number',
              message: 'must be a number'
            }
          ])('rejects $label', ({ value, message }) => {
            const details = expectValidationError(validationSchema, {
              [field]: value
            })
            expect(details[0].message).toBe(message)
          })
        })
      }
    })

    describe('RECYCLABLE_PROPORTION_PERCENTAGE validation', () => {
      it.each([
        { label: 'zero', value: 0 },
        { label: 'one (100%)', value: 1 },
        { label: 'value within range (0.5)', value: 0.5 },
        { label: 'small percentage (0.01 = 1%)', value: 0.01 },
        { label: 'high percentage (0.99 = 99%)', value: 0.99 }
      ])('accepts $label', ({ value }) => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: value
        })
        expect(error).toBeUndefined()
      })

      it.each([
        { label: 'negative value', value: -0.1, message: 'must be at least 0' },
        { label: 'value above 1', value: 1.1, message: 'must be at most 1' },
        {
          label: 'non-number',
          value: 'fifty percent',
          message: 'must be a number'
        }
      ])('rejects $label', ({ value, message }) => {
        const details = expectValidationError(validationSchema, {
          RECYCLABLE_PROPORTION_PERCENTAGE: value
        })
        expect(details[0].message).toBe(message)
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

      it.each([
        { label: 'lowercase "yes"', value: 'yes' },
        { label: 'lowercase "no"', value: 'no' },
        { label: 'uppercase "YES"', value: 'YES' },
        { label: 'other strings', value: 'Maybe' }
      ])('rejects $label', ({ value }) => {
        const details = expectValidationError(validationSchema, {
          BAILING_WIRE_PROTOCOL: value
        })
        expect(details[0].message).toBe('must be Yes or No')
      })
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

      it.each([
        { label: 'invalid method', value: 'Some other method' },
        { label: 'case variations', value: 'aaig percentage' },
        { label: 'non-string', value: 123 }
      ])('rejects $label', ({ value }) => {
        const details = expectValidationError(validationSchema, {
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: value
        })
        expect(details[0].message).toBe(
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

      it.each([
        { label: 'lowercase "yes"', value: 'yes' },
        { label: 'lowercase "no"', value: 'no' },
        { label: 'other strings', value: 'N/A' }
      ])('rejects $label', ({ value }) => {
        const details = expectValidationError(validationSchema, {
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: value
        })
        expect(details[0].message).toBe('must be Yes or No')
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
        const details = expectValidationError(validationSchema, {
          GROSS_WEIGHT: 100,
          TARE_WEIGHT: 5,
          PALLET_WEIGHT: 5,
          NET_WEIGHT: 100
        })
        expect(details[0].type).toBe('custom.netWeightCalculationMismatch')
      })

      it('rejects calculation that is close but outside tolerance', () => {
        const details = expectValidationError(validationSchema, {
          GROSS_WEIGHT: 100,
          TARE_WEIGHT: 5,
          PALLET_WEIGHT: 5,
          NET_WEIGHT: 90.001
        })
        expect(details[0].type).toBe('custom.netWeightCalculationMismatch')
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
        const details = expectValidationError(validationSchema, {
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'No',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_RECYCLING: 80 // Should be 72
        })
        expect(details[0].message).toBe(
          'must equal the calculated tonnage based on NET_WEIGHT, WEIGHT_OF_NON_TARGET_MATERIALS, BAILING_WIRE_PROTOCOL, and RECYCLABLE_PROPORTION_PERCENTAGE'
        )
      })

      it('rejects calculation without bailing wire deduction when protocol is Yes', () => {
        const details = expectValidationError(validationSchema, {
          NET_WEIGHT: 100,
          WEIGHT_OF_NON_TARGET_MATERIALS: 10,
          BAILING_WIRE_PROTOCOL: 'Yes',
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
          TONNAGE_RECEIVED_FOR_RECYCLING: 72 // Wrong - should be 71.892
        })
        expect(details[0].message).toBe(
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
        const details = expectValidationError(validationSchema, {
          ROW_ID: 999,
          GROSS_WEIGHT: -1,
          RECYCLABLE_PROPORTION_PERCENTAGE: 1.5
        })
        expect(details.length).toBe(3)
      })

      it('reports errors for multiple weight fields when invalid', () => {
        const details = expectValidationError(validationSchema, {
          GROSS_WEIGHT: 1001,
          TARE_WEIGHT: -1,
          PALLET_WEIGHT: 1001
        })
        expect(details.length).toBe(3)
      })

      it('reports errors for Yes/No fields when invalid', () => {
        const details = expectValidationError(validationSchema, {
          BAILING_WIRE_PROTOCOL: 'maybe',
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'unknown'
        })
        expect(details.length).toBe(2)
      })
    })
  })

  describe('classifyForWasteBalance', () => {
    const accreditation = buildAccreditation({
      validFrom: '2024-01-01',
      validTo: '2024-12-31',
      statusHistory: [
        { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' }
      ]
    })

    /** @type {Record<string, any>} */
    const completeRow = {
      ROW_ID: 1000,
      DATE_RECEIVED_FOR_REPROCESSING: new Date('2024-06-15'),
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
      TONNAGE_RECEIVED_FOR_RECYCLING: 50.5
    }

    describe('INCLUDED outcome', () => {
      it('returns INCLUDED with transaction amount when all fields filled, date in range, and no PRN', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation
        })
        if (result.outcome !== ROW_OUTCOME.INCLUDED) {
          throw new Error(`expected INCLUDED outcome, got ${result.outcome}`)
        }

        expect(result.reasons).toEqual([])
        expect(result.transactionAmount).toBe(50.5)
      })

      it('rounds transaction amount to two decimal places', () => {
        const row = { ...completeRow, TONNAGE_RECEIVED_FOR_RECYCLING: 50.555 }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        if (result.outcome !== ROW_OUTCOME.INCLUDED) {
          throw new Error(`expected INCLUDED outcome, got ${result.outcome}`)
        }

        expect(result.transactionAmount).toBe(50.56)
      })
    })

    describe('EXCLUDED outcome - missing required fields', () => {
      it('returns EXCLUDED when a required field is missing', () => {
        const row = { ...completeRow }
        delete row.TONNAGE_RECEIVED_FOR_RECYCLING
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD,
          field: 'TONNAGE_RECEIVED_FOR_RECYCLING'
        })
      })

      it('returns EXCLUDED with all missing fields listed', () => {
        const row = { ...completeRow }
        delete row.ROW_ID
        delete row.TONNAGE_RECEIVED_FOR_RECYCLING
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toHaveLength(2)
      })

      it('returns EXCLUDED when required field is null', () => {
        const row = { ...completeRow, TONNAGE_RECEIVED_FOR_RECYCLING: null }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
      })

      it('returns EXCLUDED when required field is empty string', () => {
        const row = { ...completeRow, EWC_CODE: '' }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
      })

      it('returns EXCLUDED when dropdown field has placeholder value', () => {
        const row = { ...completeRow, BAILING_WIRE_PROTOCOL: 'Choose option' }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
      })
    })

    describe('IGNORED outcome - date outside accreditation', () => {
      it('returns IGNORED when date is before accreditation period', () => {
        const row = {
          ...completeRow,
          DATE_RECEIVED_FOR_REPROCESSING: new Date('2023-12-31')
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
        })
      })

      it('returns IGNORED when date is after accreditation period', () => {
        const row = {
          ...completeRow,
          DATE_RECEIVED_FOR_REPROCESSING: new Date('2025-01-01')
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
      })

      it('returns INCLUDED when date is on accreditation start boundary', () => {
        const row = {
          ...completeRow,
          DATE_RECEIVED_FOR_REPROCESSING: new Date('2024-01-01')
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })

      it('returns INCLUDED when date is on accreditation end boundary', () => {
        const row = {
          ...completeRow,
          DATE_RECEIVED_FOR_REPROCESSING: new Date('2024-12-31')
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })
    })

    describe('EXCLUDED outcome - PRN issued', () => {
      it('returns EXCLUDED when PRN was issued', () => {
        const row = {
          ...completeRow,
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'Yes'
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.PRN_ISSUED
        })
      })
    })

    describe('INCLUDED outcome - null accreditation', () => {
      it('returns INCLUDED when accreditation is null (accreditation check passes)', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: null
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
      })

      it('returns INCLUDED when accreditation has empty statusHistory', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: buildAccreditation({
            validFrom: '2024-01-01',
            validTo: '2024-12-31',
            statusHistory: []
          })
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
      })
    })

    describe('IGNORED outcome - suspended accreditation', () => {
      it('returns IGNORED when accreditation was suspended before the row date', () => {
        const suspendedAccreditation = buildAccreditation({
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          statusHistory: [
            { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' },
            { status: 'suspended', updatedAt: '2024-03-01T00:00:00.000Z' }
          ]
        })
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: suspendedAccreditation
        })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
        })
      })

      it('returns INCLUDED when accreditation was suspended then re-approved before the row date', () => {
        const reapprovedAccreditation = buildAccreditation({
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          statusHistory: [
            { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' },
            { status: 'suspended', updatedAt: '2024-03-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2024-04-01T00:00:00.000Z' }
          ]
        })
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: reapprovedAccreditation
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })
    })

    describe('classification priority', () => {
      it('checks required fields before date range', () => {
        const row = {}
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons[0].code).toBe(
          CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD
        )
      })

      it('checks date range before PRN', () => {
        const row = {
          ...completeRow,
          DATE_RECEIVED_FOR_REPROCESSING: new Date('2023-01-01'),
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'Yes'
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
      })
    })
  })
})
