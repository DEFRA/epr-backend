import { describe, expect, it } from 'vitest'
import { RECEIVED_LOADS_FOR_REPROCESSING } from './received-loads-for-reprocessing.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import { CLASSIFICATION_REASON } from '../shared/classify-helpers.js'
import { transformReceivedLoadsRowReprocessorOutput } from '#application/waste-records/row-transformers/received-loads-reprocessing-output.js'

describe('RECEIVED_LOADS_FOR_REPROCESSING (REPROCESSOR_OUTPUT)', () => {
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

    it('has rowTransformer set to transformReceivedLoadsRowReprocessorOutput', () => {
      expect(schema.rowTransformer).toBe(
        transformReceivedLoadsRowReprocessorOutput
      )
    })

    describe('requiredHeaders (VAL008 - column presence validation)', () => {
      it('contains ROW_ID column', () => {
        expect(schema.requiredHeaders).toContain('ROW_ID')
      })

      it('contains Section 1 columns (all optional for REPROCESSOR_OUTPUT)', () => {
        expect(schema.requiredHeaders).toContain(
          'DATE_RECEIVED_FOR_REPROCESSING'
        )
        expect(schema.requiredHeaders).toContain('EWC_CODE')
        expect(schema.requiredHeaders).toContain('DESCRIPTION_WASTE')
        expect(schema.requiredHeaders).toContain(
          'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE'
        )
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
      })

      it('contains Section 2 columns (supplier details)', () => {
        expect(schema.requiredHeaders).toContain('SUPPLIER_NAME')
        expect(schema.requiredHeaders).toContain('SUPPLIER_ADDRESS')
        expect(schema.requiredHeaders).toContain('SUPPLIER_POSTCODE')
        expect(schema.requiredHeaders).toContain('SUPPLIER_EMAIL')
        expect(schema.requiredHeaders).toContain('SUPPLIER_PHONE_NUMBER')
        expect(schema.requiredHeaders).toContain(
          'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER'
        )
      })

      it('contains Section 3 columns (additional details)', () => {
        expect(schema.requiredHeaders).toContain('YOUR_REFERENCE')
        expect(schema.requiredHeaders).toContain('WEIGHBRIDGE_TICKET')
        expect(schema.requiredHeaders).toContain('CARRIER_NAME')
        expect(schema.requiredHeaders).toContain('CBD_REG_NUMBER')
        expect(schema.requiredHeaders).toContain(
          'CARRIER_VEHICLE_REGISTRATION_NUMBER'
        )
      })

      it('has exactly 25 required headers (all optional for REPROCESSOR_OUTPUT)', () => {
        expect(schema.requiredHeaders).toHaveLength(25)
      })
    })

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      it('is empty (table does not contribute to waste balance for REPROCESSOR_OUTPUT)', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toHaveLength(0)
      })
    })

    it('has unfilledValues with dropdown placeholders matching template', () => {
      expect(schema.unfilledValues.EWC_CODE).toContain('Choose option')
      expect(schema.unfilledValues.DESCRIPTION_WASTE).toContain('Choose option')
      expect(
        schema.unfilledValues.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
      ).toContain('Choose option')
      expect(schema.unfilledValues.BAILING_WIRE_PROTOCOL).toContain(
        'Choose option'
      )
      expect(
        schema.unfilledValues.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION
      ).toContain('Choose option')
    })

    it('has validationSchema (Joi schema for VAL010)', () => {
      expect(schema.validationSchema).toBeDefined()
      expect(typeof schema.validationSchema.validate).toBe('function')
    })
  })

  describe('classifyForWasteBalance', () => {
    const accreditation = {
      validFrom: new Date('2024-01-01'),
      validTo: new Date('2024-12-31')
    }

    it('returns IGNORED when DATE_RECEIVED_FOR_REPROCESSING is outside accreditation period', () => {
      const data = { DATE_RECEIVED_FOR_REPROCESSING: new Date('2023-06-15') }

      const result = schema.classifyForWasteBalance(data, { accreditation })

      expect(result).toEqual({
        outcome: ROW_OUTCOME.IGNORED,
        reasons: [{ code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD }]
      })
    })

    it('returns EXCLUDED when DATE_RECEIVED_FOR_REPROCESSING is within accreditation period', () => {
      const data = { DATE_RECEIVED_FOR_REPROCESSING: new Date('2024-06-15') }

      const result = schema.classifyForWasteBalance(data, { accreditation })

      expect(result).toEqual({ outcome: ROW_OUTCOME.EXCLUDED, reasons: [] })
    })

    it('returns EXCLUDED when DATE_RECEIVED_FOR_REPROCESSING is not present', () => {
      const data = {}

      const result = schema.classifyForWasteBalance(data, { accreditation })

      expect(result).toEqual({ outcome: ROW_OUTCOME.EXCLUDED, reasons: [] })
    })
  })

  describe('validationSchema (VAL010)', () => {
    const { validationSchema } = schema

    it('accepts empty object (all fields optional for data validation)', () => {
      const { error } = validationSchema.validate({})
      expect(error).toBeUndefined()
    })

    it('accepts unknown fields', () => {
      const { error } = validationSchema.validate({ UNKNOWN_FIELD: 'value' })
      expect(error).toBeUndefined()
    })
  })
})
