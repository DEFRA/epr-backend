import { describe, expect, it } from 'vitest'
import { TABLE_SCHEMAS } from './index.js'

const { SENT_ON_LOADS } = TABLE_SCHEMAS

describe('SENT_ON_LOADS (REPROCESSOR_REGISTERED_ONLY)', () => {
  const schema = SENT_ON_LOADS

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    describe('requiredHeaders (VAL008 - column presence validation)', () => {
      it('contains waste balance columns', () => {
        expect(schema.requiredHeaders).toContain('ROW_ID')
        expect(schema.requiredHeaders).toContain('DATE_LOAD_LEFT_SITE')
        expect(schema.requiredHeaders).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        )
      })

      it('contains destination columns', () => {
        expect(schema.requiredHeaders).toContain(
          'FINAL_DESTINATION_FACILITY_TYPE'
        )
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_NAME')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_ADDRESS')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_POSTCODE')
      })

      it('does not contain supplementary fields from accredited version', () => {
        expect(schema.requiredHeaders).not.toContain('FINAL_DESTINATION_EMAIL')
        expect(schema.requiredHeaders).not.toContain('FINAL_DESTINATION_PHONE')
        expect(schema.requiredHeaders).not.toContain('YOUR_REFERENCE')
        expect(schema.requiredHeaders).not.toContain('DESCRIPTION_WASTE')
        expect(schema.requiredHeaders).not.toContain('EWC_CODE')
        expect(schema.requiredHeaders).not.toContain('WEIGHBRIDGE_TICKET')
      })

      it('has exactly 7 required headers', () => {
        expect(schema.requiredHeaders).toHaveLength(7)
      })
    })

    it('has unfilledValues object', () => {
      expect(typeof schema.unfilledValues).toBe('object')
    })

    it('has validationSchema with validate function', () => {
      expect(schema.validationSchema).toBeDefined()
      expect(typeof schema.validationSchema.validate).toBe('function')
    })

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      it('is empty (registered-only operators have no waste balance)', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toEqual([])
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
  })
})
