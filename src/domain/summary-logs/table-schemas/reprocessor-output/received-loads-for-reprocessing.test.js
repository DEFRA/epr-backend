import { describe, expect, it } from 'vitest'
import { RECEIVED_LOADS_FOR_REPROCESSING } from './received-loads-for-reprocessing.js'

describe('RECEIVED_LOADS_FOR_REPROCESSING (REPROCESSOR_OUTPUT)', () => {
  const schema = RECEIVED_LOADS_FOR_REPROCESSING

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
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

    describe('fatalFields (data validation)', () => {
      it('contains ROW_ID as fatal (always fatal)', () => {
        expect(schema.fatalFields).toContain('ROW_ID')
      })

      it('has exactly 1 fatal field (ROW_ID only - all other fields optional)', () => {
        expect(schema.fatalFields).toHaveLength(1)
      })

      it('does NOT contain Section 1 columns', () => {
        expect(schema.fatalFields).not.toContain(
          'DATE_RECEIVED_FOR_REPROCESSING'
        )
        expect(schema.fatalFields).not.toContain('EWC_CODE')
        expect(schema.fatalFields).not.toContain('GROSS_WEIGHT')
        expect(schema.fatalFields).not.toContain('NET_WEIGHT')
        expect(schema.fatalFields).not.toContain(
          'TONNAGE_RECEIVED_FOR_RECYCLING'
        )
      })

      it('does NOT contain Section 2 or 3 columns', () => {
        expect(schema.fatalFields).not.toContain('SUPPLIER_NAME')
        expect(schema.fatalFields).not.toContain('YOUR_REFERENCE')
        expect(schema.fatalFields).not.toContain('CARRIER_NAME')
      })
    })

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      it('is empty (table does not contribute to waste balance for REPROCESSOR_OUTPUT)', () => {
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
