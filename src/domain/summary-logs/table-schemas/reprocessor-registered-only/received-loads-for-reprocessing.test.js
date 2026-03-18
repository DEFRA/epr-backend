import { describe, expect, it } from 'vitest'
import { TABLE_SCHEMAS } from './index.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformReceivedLoadsRowRegisteredOnly } from '#application/waste-records/row-transformers/received-loads-reprocessing-registered-only.js'

const { RECEIVED_LOADS_FOR_REPROCESSING } = TABLE_SCHEMAS

describe('RECEIVED_LOADS_FOR_REPROCESSING (REPROCESSOR_REGISTERED_ONLY)', () => {
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

    it('has rowTransformer set to transformReceivedLoadsRowRegisteredOnly', () => {
      expect(schema.rowTransformer).toBe(
        transformReceivedLoadsRowRegisteredOnly
      )
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

    it('treats HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION as unfilled dropdown', () => {
      expect(
        schema.unfilledValues.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION
      ).toContain('Choose option')
    })

    it('treats MONTH_RECEIVED_FOR_REPROCESSING as unfilled dropdown', () => {
      expect(schema.unfilledValues.MONTH_RECEIVED_FOR_REPROCESSING).toContain(
        'Choose option'
      )
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

    it('validates ROW_ID as integer >= 1000', () => {
      const valid = validationSchema.validate({ ROW_ID: 1000 })
      expect(valid.error).toBeUndefined()

      const tooLow = validationSchema.validate({ ROW_ID: 999 })
      expect(tooLow.error).toBeDefined()

      const notInteger = validationSchema.validate({ ROW_ID: 1000.5 })
      expect(notInteger.error).toBeDefined()
    })

    it('validates MONTH_RECEIVED_FOR_REPROCESSING as first-of-month date string', () => {
      const valid = validationSchema.validate({
        MONTH_RECEIVED_FOR_REPROCESSING: '2025-01-01'
      })
      expect(valid.error).toBeUndefined()

      const midMonth = validationSchema.validate({
        MONTH_RECEIVED_FOR_REPROCESSING: '2025-01-15'
      })
      expect(midMonth.error).toBeDefined()

      const notADate = validationSchema.validate({
        MONTH_RECEIVED_FOR_REPROCESSING: 'January'
      })
      expect(notADate.error).toBeDefined()
    })

    it('validates NET_WEIGHT as number >= 0 with no upper bound', () => {
      const valid = validationSchema.validate({ NET_WEIGHT: 10.5 })
      expect(valid.error).toBeUndefined()

      const negative = validationSchema.validate({ NET_WEIGHT: -1 })
      expect(negative.error).toBeDefined()

      const large = validationSchema.validate({ NET_WEIGHT: 50000 })
      expect(large.error).toBeUndefined()
    })

    it('validates HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION as enum', () => {
      const valid = validationSchema.validate({
        HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Actual weight (100%)'
      })
      expect(valid.error).toBeUndefined()

      const invalid = validationSchema.validate({
        HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Made it up'
      })
      expect(invalid.error).toBeDefined()
    })

    it('validates RECYCLABLE_PROPORTION_PERCENTAGE as number between 0 and 1', () => {
      const valid = validationSchema.validate({
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.95
      })
      expect(valid.error).toBeUndefined()

      const tooHigh = validationSchema.validate({
        RECYCLABLE_PROPORTION_PERCENTAGE: 1.5
      })
      expect(tooHigh.error).toBeDefined()
    })

    it('validates TONNAGE_RECEIVED_FOR_RECYCLING as number >= 0 with no upper bound', () => {
      const valid = validationSchema.validate({
        TONNAGE_RECEIVED_FOR_RECYCLING: 9.975
      })
      expect(valid.error).toBeUndefined()

      const negative = validationSchema.validate({
        TONNAGE_RECEIVED_FOR_RECYCLING: -1
      })
      expect(negative.error).toBeDefined()

      const large = validationSchema.validate({
        TONNAGE_RECEIVED_FOR_RECYCLING: 50000
      })
      expect(large.error).toBeUndefined()
    })
  })
})
