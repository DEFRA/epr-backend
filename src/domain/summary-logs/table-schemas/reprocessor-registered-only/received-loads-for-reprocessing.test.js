import { describe, expect, it } from 'vitest'
import { TABLE_SCHEMAS } from './index.js'

const { RECEIVED_LOADS_FOR_REPROCESSING } = TABLE_SCHEMAS

describe('RECEIVED_LOADS_FOR_REPROCESSING (REPROCESSOR_REGISTERED_ONLY)', () => {
  const schema = RECEIVED_LOADS_FOR_REPROCESSING

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    describe('requiredHeaders (VAL008 - column presence validation)', () => {
      it('contains ROW_ID', () => {
        expect(schema.requiredHeaders).toContain('ROW_ID')
      })

      it('contains MONTH_RECEIVED_FOR_REPROCESSING (monthly granularity, not daily)', () => {
        expect(schema.requiredHeaders).toContain(
          'MONTH_RECEIVED_FOR_REPROCESSING'
        )
      })

      it('does not contain DATE_RECEIVED_FOR_REPROCESSING (accredited version only)', () => {
        expect(schema.requiredHeaders).not.toContain(
          'DATE_RECEIVED_FOR_REPROCESSING'
        )
      })

      it('contains tonnage calculation fields', () => {
        expect(schema.requiredHeaders).toContain('NET_WEIGHT')
        expect(schema.requiredHeaders).toContain(
          'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION'
        )
        expect(schema.requiredHeaders).toContain(
          'RECYCLABLE_PROPORTION_PERCENTAGE'
        )
        expect(schema.requiredHeaders).toContain(
          'TONNAGE_RECEIVED_FOR_RECYCLING'
        )
      })

      it('contains supplier fields', () => {
        expect(schema.requiredHeaders).toContain('SUPPLIER_NAME')
        expect(schema.requiredHeaders).toContain('SUPPLIER_ADDRESS')
        expect(schema.requiredHeaders).toContain('SUPPLIER_POSTCODE')
        expect(schema.requiredHeaders).toContain('SUPPLIER_EMAIL')
        expect(schema.requiredHeaders).toContain('SUPPLIER_PHONE_NUMBER')
        expect(schema.requiredHeaders).toContain(
          'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER'
        )
      })

      it('does not contain detailed weighing fields (accredited version only)', () => {
        expect(schema.requiredHeaders).not.toContain('GROSS_WEIGHT')
        expect(schema.requiredHeaders).not.toContain('TARE_WEIGHT')
        expect(schema.requiredHeaders).not.toContain('PALLET_WEIGHT')
        expect(schema.requiredHeaders).not.toContain('BAILING_WIRE_PROTOCOL')
        expect(schema.requiredHeaders).not.toContain(
          'WEIGHT_OF_NON_TARGET_MATERIALS'
        )
      })

      it('does not contain waste classification fields (accredited version only)', () => {
        expect(schema.requiredHeaders).not.toContain('EWC_CODE')
        expect(schema.requiredHeaders).not.toContain('DESCRIPTION_WASTE')
        expect(schema.requiredHeaders).not.toContain(
          'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE'
        )
      })

      it('does not contain carrier fields (accredited version only)', () => {
        expect(schema.requiredHeaders).not.toContain('CARRIER_NAME')
        expect(schema.requiredHeaders).not.toContain('CBD_REG_NUMBER')
        expect(schema.requiredHeaders).not.toContain(
          'CARRIER_VEHICLE_REGISTRATION_NUMBER'
        )
      })

      it('does not contain reference fields (accredited version only)', () => {
        expect(schema.requiredHeaders).not.toContain('YOUR_REFERENCE')
        expect(schema.requiredHeaders).not.toContain('WEIGHBRIDGE_TICKET')
      })

      it('has exactly 12 required headers', () => {
        expect(schema.requiredHeaders).toHaveLength(12)
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
