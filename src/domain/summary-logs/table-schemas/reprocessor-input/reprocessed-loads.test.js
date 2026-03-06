import { describe, expect, it } from 'vitest'
import { REPROCESSED_LOADS } from './reprocessed-loads.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformReprocessedLoadsRowReprocessorInput } from '#application/waste-records/row-transformers/reprocessed-loads-reprocessor-input.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'

describe('REPROCESSED_LOADS (REPROCESSOR_INPUT)', () => {
  const schema = REPROCESSED_LOADS

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has wasteRecordType set to PROCESSED', () => {
      expect(schema.wasteRecordType).toBe(WASTE_RECORD_TYPE.PROCESSED)
    })

    it('has sheetName set to Processed', () => {
      expect(schema.sheetName).toBe('Processed')
    })

    it('has rowTransformer set to transformReprocessedLoadsRowReprocessorInput', () => {
      expect(schema.rowTransformer).toBe(
        transformReprocessedLoadsRowReprocessorInput
      )
    })

    describe('requiredHeaders (VAL008 - column presence validation)', () => {
      it('contains ROW_ID column', () => {
        expect(schema.requiredHeaders).toContain('ROW_ID')
      })

      it('contains all optional columns from template', () => {
        expect(schema.requiredHeaders).toContain('DATE_LOAD_LEFT_SITE')
        expect(schema.requiredHeaders).toContain('PRODUCT_DESCRIPTION')
        expect(schema.requiredHeaders).toContain('END_OF_WASTE_STANDARDS')
        expect(schema.requiredHeaders).toContain('PRODUCT_TONNAGE')
        expect(schema.requiredHeaders).toContain('WEIGHBRIDGE_TICKET_NUMBER')
        expect(schema.requiredHeaders).toContain('HAULIER_NAME')
        expect(schema.requiredHeaders).toContain(
          'HAULIER_VEHICLE_REGISTRATION_NUMBER'
        )
        expect(schema.requiredHeaders).toContain('CUSTOMER_NAME')
        expect(schema.requiredHeaders).toContain('CUSTOMER_INVOICE_REFERENCE')
      })

      it('has exactly 10 required headers', () => {
        expect(schema.requiredHeaders).toHaveLength(10)
      })
    })

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      it('is empty (table does not contribute to waste balance)', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toHaveLength(0)
      })
    })

    it('has unfilledValues with dropdown placeholders matching template', () => {
      expect(schema.unfilledValues.END_OF_WASTE_STANDARDS).toContain(
        'Choose option'
      )
    })

    it('has validationSchema (Joi schema for VAL010)', () => {
      expect(schema.validationSchema).toBeDefined()
      expect(typeof schema.validationSchema.validate).toBe('function')
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

  describe('classifyForWasteBalance', () => {
    it('returns EXCLUDED with no reasons regardless of data', () => {
      const result = schema.classifyForWasteBalance(
        { ROW_ID: 4000, PRODUCT_TONNAGE: 100 },
        { accreditation: { validFrom: '2024-01-01', validTo: '2024-12-31' } }
      )
      expect(result).toEqual({
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: []
      })
    })

    it('returns EXCLUDED even with empty data', () => {
      const result = schema.classifyForWasteBalance({}, { accreditation: {} })
      expect(result).toEqual({
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: []
      })
    })
  })
})
