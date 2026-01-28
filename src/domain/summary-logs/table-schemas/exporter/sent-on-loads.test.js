import { describe, expect, it } from 'vitest'
import { SENT_ON_LOADS } from './sent-on-loads.js'

describe('SENT_ON_LOADS (EXPORTER)', () => {
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

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      it('contains fields required for waste balance calculation', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'ROW_ID'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'DATE_LOAD_LEFT_SITE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        )
      })

      it('has exactly 3 fields required for waste balance', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toHaveLength(3)
      })

      it('does NOT contain supplementary columns', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_FACILITY_TYPE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_NAME'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_ADDRESS'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_POSTCODE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_EMAIL'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_PHONE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'YOUR_REFERENCE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'DESCRIPTION_WASTE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'EWC_CODE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
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
