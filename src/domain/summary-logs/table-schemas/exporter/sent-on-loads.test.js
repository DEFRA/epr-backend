import { describe, expect, it } from 'vitest'
import { SENT_ON_LOADS } from './sent-on-loads.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformSentOnLoadsRowExporter } from '#application/waste-records/row-transformers/sent-on-loads-exporter.js'

describe('SENT_ON_LOADS (EXPORTER)', () => {
  const schema = SENT_ON_LOADS

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has wasteRecordType set to SENT_ON', () => {
      expect(schema.wasteRecordType).toBe(WASTE_RECORD_TYPE.SENT_ON)
    })

    it('has sheetName set to Sent on', () => {
      expect(schema.sheetName).toBe('Sent on')
    })

    it('has rowTransformer set to transformSentOnLoadsRowExporter', () => {
      expect(schema.rowTransformer).toBe(transformSentOnLoadsRowExporter)
    })

    describe('requiredHeaders (VAL008 - column presence validation)', () => {
      it('contains all waste balance columns', () => {
        expect(schema.requiredHeaders).toContain('ROW_ID')
        expect(schema.requiredHeaders).toContain('DATE_LOAD_LEFT_SITE')
        expect(schema.requiredHeaders).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        )
      })

      it('contains all supplementary columns from template sections', () => {
        expect(schema.requiredHeaders).toContain(
          'FINAL_DESTINATION_FACILITY_TYPE'
        )
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_NAME')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_ADDRESS')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_POSTCODE')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_EMAIL')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_PHONE')
        expect(schema.requiredHeaders).toContain('YOUR_REFERENCE')
        expect(schema.requiredHeaders).toContain('DESCRIPTION_WASTE')
        expect(schema.requiredHeaders).toContain('EWC_CODE')
        expect(schema.requiredHeaders).toContain('WEIGHBRIDGE_TICKET')
      })

      it('has exactly 13 required headers', () => {
        expect(schema.requiredHeaders).toHaveLength(13)
      })
    })

    it('has unfilledValues object', () => {
      expect(typeof schema.unfilledValues).toBe('object')
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
})
