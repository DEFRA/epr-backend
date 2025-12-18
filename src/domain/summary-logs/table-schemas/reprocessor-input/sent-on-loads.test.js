import { describe, expect, it } from 'vitest'
import { SENT_ON_LOADS } from './sent-on-loads.js'

describe('SENT_ON_LOADS (REPROCESSOR_INPUT)', () => {
  const schema = SENT_ON_LOADS

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
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

    describe('fatalFields (data validation - waste balance fields only)', () => {
      it('contains waste balance fields that cause fatal errors on validation failure', () => {
        expect(schema.fatalFields).toContain('ROW_ID')
        expect(schema.fatalFields).toContain('DATE_LOAD_LEFT_SITE')
        expect(schema.fatalFields).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        )
      })

      it('has exactly 3 fatal fields (waste balance columns only)', () => {
        expect(schema.fatalFields).toHaveLength(3)
      })

      it('does NOT contain supplementary columns', () => {
        expect(schema.fatalFields).not.toContain(
          'FINAL_DESTINATION_FACILITY_TYPE'
        )
        expect(schema.fatalFields).not.toContain('FINAL_DESTINATION_NAME')
        expect(schema.fatalFields).not.toContain('FINAL_DESTINATION_ADDRESS')
        expect(schema.fatalFields).not.toContain('FINAL_DESTINATION_POSTCODE')
        expect(schema.fatalFields).not.toContain('FINAL_DESTINATION_EMAIL')
        expect(schema.fatalFields).not.toContain('FINAL_DESTINATION_PHONE')
        expect(schema.fatalFields).not.toContain('YOUR_REFERENCE')
        expect(schema.fatalFields).not.toContain('DESCRIPTION_WASTE')
        expect(schema.fatalFields).not.toContain('EWC_CODE')
        expect(schema.fatalFields).not.toContain('WEIGHBRIDGE_TICKET')
      })
    })

    describe('fieldsRequiredForWasteBalance (VAL011)', () => {
      it('contains fields required for waste balance calculation', () => {
        expect(schema.fieldsRequiredForWasteBalance).toContain('ROW_ID')
        expect(schema.fieldsRequiredForWasteBalance).toContain(
          'DATE_LOAD_LEFT_SITE'
        )
        expect(schema.fieldsRequiredForWasteBalance).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        )
      })

      it('has exactly 3 fields required for waste balance', () => {
        expect(schema.fieldsRequiredForWasteBalance).toHaveLength(3)
      })

      it('does NOT contain supplementary columns', () => {
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'FINAL_DESTINATION_FACILITY_TYPE'
        )
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'FINAL_DESTINATION_NAME'
        )
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'FINAL_DESTINATION_ADDRESS'
        )
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'FINAL_DESTINATION_POSTCODE'
        )
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'FINAL_DESTINATION_EMAIL'
        )
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'FINAL_DESTINATION_PHONE'
        )
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'YOUR_REFERENCE'
        )
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'DESCRIPTION_WASTE'
        )
        expect(schema.fieldsRequiredForWasteBalance).not.toContain('EWC_CODE')
        expect(schema.fieldsRequiredForWasteBalance).not.toContain(
          'WEIGHBRIDGE_TICKET'
        )
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

    it('accepts empty object (all fields optional)', () => {
      const { error } = validationSchema.validate({})
      expect(error).toBeUndefined()
    })

    it('accepts unknown fields', () => {
      const { error } = validationSchema.validate({ UNKNOWN_FIELD: 'value' })
      expect(error).toBeUndefined()
    })

    describe('ROW_ID validation', () => {
      it('accepts valid ROW_ID at minimum (5000)', () => {
        const { error } = validationSchema.validate({ ROW_ID: 5000 })
        expect(error).toBeUndefined()
      })

      it('accepts valid ROW_ID above minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 5500 })
        expect(error).toBeUndefined()
      })

      it('rejects ROW_ID below minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 4999 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 5000')
      })

      it('rejects non-integer ROW_ID', () => {
        const { error } = validationSchema.validate({ ROW_ID: 5000.5 })
        expect(error).toBeDefined()
      })
    })

    describe('DATE_LOAD_LEFT_SITE validation', () => {
      it('accepts valid Date object', () => {
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: new Date('2024-06-15')
        })
        expect(error).toBeUndefined()
      })

      it('accepts date string that can be parsed', () => {
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: '2024-06-15'
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid date string', () => {
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: 'not-a-date'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a valid date')
      })
    })

    describe('TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON validation', () => {
      it('accepts zero', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 0
        })
        expect(error).toBeUndefined()
      })

      it('accepts maximum value (1000)', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 1000
        })
        expect(error).toBeUndefined()
      })

      it('accepts value within range', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 500.5
        })
        expect(error).toBeUndefined()
      })

      it('accepts small decimal value', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 0.01
        })
        expect(error).toBeUndefined()
      })

      it('rejects negative value', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: -1
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 0')
      })

      it('rejects value above maximum (1000)', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 1001
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 1000')
      })

      it('rejects non-number', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 'not-a-number'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('multiple field validation', () => {
      it('reports all errors when multiple fields invalid', () => {
        const { error } = validationSchema.validate({
          ROW_ID: 4999,
          DATE_LOAD_LEFT_SITE: 'not-a-date',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: -1
        })
        expect(error).toBeDefined()
        expect(error.details.length).toBe(3)
      })
    })
  })
})
