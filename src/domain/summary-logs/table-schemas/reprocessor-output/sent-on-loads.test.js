import { describe, expect, it } from 'vitest'
import { SENT_ON_LOADS } from './sent-on-loads.js'

describe('SENT_ON_LOADS (REPROCESSOR_OUTPUT)', () => {
  const schema = SENT_ON_LOADS

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    describe('requiredHeaders (VAL008 - column presence validation)', () => {
      it('contains ROW_ID column', () => {
        expect(schema.requiredHeaders).toContain('ROW_ID')
      })

      it('contains mandatory columns (all optional for REPROCESSOR_OUTPUT)', () => {
        expect(schema.requiredHeaders).toContain('DATE_LOAD_LEFT_SITE')
        expect(schema.requiredHeaders).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        )
      })

      it('contains final destination columns', () => {
        expect(schema.requiredHeaders).toContain(
          'FINAL_DESTINATION_FACILITY_TYPE'
        )
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_NAME')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_ADDRESS')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_POSTCODE')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_EMAIL')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_PHONE')
      })

      it('contains additional columns', () => {
        expect(schema.requiredHeaders).toContain('YOUR_REFERENCE')
        expect(schema.requiredHeaders).toContain('DESCRIPTION_WASTE')
      })

      it('has exactly 11 required headers (all optional for REPROCESSOR_OUTPUT)', () => {
        expect(schema.requiredHeaders).toHaveLength(11)
      })
    })

    describe('fatalFields (data validation)', () => {
      it('contains ROW_ID as fatal (always fatal)', () => {
        expect(schema.fatalFields).toContain('ROW_ID')
      })

      it('has exactly 1 fatal field (ROW_ID only - all other fields optional)', () => {
        expect(schema.fatalFields).toHaveLength(1)
      })

      it('does NOT contain other columns', () => {
        expect(schema.fatalFields).not.toContain('DATE_LOAD_LEFT_SITE')
        expect(schema.fatalFields).not.toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        )
        expect(schema.fatalFields).not.toContain(
          'FINAL_DESTINATION_FACILITY_TYPE'
        )
        expect(schema.fatalFields).not.toContain('YOUR_REFERENCE')
      })
    })

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      it('is empty (table does not contribute to waste balance for REPROCESSOR_OUTPUT)', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toHaveLength(0)
      })
    })

    it('has unfilledValues with dropdown placeholders matching template', () => {
      expect(schema.unfilledValues.FINAL_DESTINATION_FACILITY_TYPE).toContain(
        'Choose option'
      )
      expect(schema.unfilledValues.DESCRIPTION_WASTE).toContain('Choose option')
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
