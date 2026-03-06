import { describe, expect, it } from 'vitest'
import { REPROCESSED_LOADS } from './reprocessed-loads.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformReprocessedLoadsRowReprocessorInput } from '#application/waste-records/row-transformers/reprocessed-loads-reprocessor-input.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import { CLASSIFICATION_REASON } from '../shared/classify-helpers.js'

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

  describe('classifyForWasteBalance', () => {
    const accreditation = { validFrom: '2025-01-01', validTo: '2025-12-31' }

    it('returns IGNORED when date is outside accreditation period', () => {
      const result = schema.classifyForWasteBalance(
        { DATE_LOAD_LEFT_SITE: '2024-12-31' },
        { accreditation }
      )
      expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
      expect(result.reasons).toContainEqual({
        code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
      })
    })

    it('returns INCLUDED when date is within accreditation period', () => {
      const result = schema.classifyForWasteBalance(
        { DATE_LOAD_LEFT_SITE: '2025-06-15' },
        { accreditation }
      )
      expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      expect(result.reasons).toEqual([])
    })

    it('returns INCLUDED when date field is empty', () => {
      const result = schema.classifyForWasteBalance(
        { DATE_LOAD_LEFT_SITE: '' },
        { accreditation }
      )
      expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
    })

    it('returns INCLUDED when date field is absent', () => {
      const result = schema.classifyForWasteBalance({}, { accreditation })
      expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
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
