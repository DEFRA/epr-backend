import { describe, expect, it } from 'vitest'
import { REPROCESSED_LOADS } from './reprocessed-loads.js'

describe('REPROCESSED_LOADS (REPROCESSOR_INPUT)', () => {
  const schema = REPROCESSED_LOADS

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
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

    describe('fatalFields (data validation)', () => {
      it('contains ROW_ID as fatal (always fatal)', () => {
        expect(schema.fatalFields).toContain('ROW_ID')
      })

      it('has exactly 1 fatal field (ROW_ID only)', () => {
        expect(schema.fatalFields).toHaveLength(1)
      })

      it('does NOT contain optional columns', () => {
        expect(schema.fatalFields).not.toContain('DATE_LOAD_LEFT_SITE')
        expect(schema.fatalFields).not.toContain('PRODUCT_DESCRIPTION')
        expect(schema.fatalFields).not.toContain('PRODUCT_TONNAGE')
        expect(schema.fatalFields).not.toContain('CUSTOMER_NAME')
      })
    })

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      it('is empty (table does not contribute to waste balance)', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toHaveLength(0)
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
