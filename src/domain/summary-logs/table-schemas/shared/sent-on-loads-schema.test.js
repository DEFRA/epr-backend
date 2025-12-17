import { describe, expect, it } from 'vitest'
import { createSentOnLoadsSchema } from './sent-on-loads-schema.js'

describe('createSentOnLoadsSchema', () => {
  const ROW_ID_MINIMUM = 4000
  const schema = createSentOnLoadsSchema(ROW_ID_MINIMUM)

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has requiredHeaders with all 13 fields', () => {
      expect(schema.requiredHeaders).toHaveLength(13)
      expect(schema.requiredHeaders).toContain('ROW_ID')
      expect(schema.requiredHeaders).toContain('DATE_LOAD_LEFT_SITE')
      expect(schema.requiredHeaders).toContain(
        'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
      )
      expect(schema.requiredHeaders).toContain(
        'FINAL_DESTINATION_FACILITY_TYPE'
      )
      expect(schema.requiredHeaders).toContain('EWC_CODE')
      expect(schema.requiredHeaders).toContain('WEIGHBRIDGE_TICKET')
    })

    it('has empty unfilledValues object', () => {
      expect(schema.unfilledValues).toEqual({})
    })

    it('has fatalFields with waste balance fields only', () => {
      expect(schema.fatalFields).toHaveLength(3)
      expect(schema.fatalFields).toContain('ROW_ID')
      expect(schema.fatalFields).toContain('DATE_LOAD_LEFT_SITE')
      expect(schema.fatalFields).toContain(
        'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
      )
    })

    it('has fieldsRequiredForWasteBalance matching fatalFields', () => {
      expect(schema.fieldsRequiredForWasteBalance).toEqual(schema.fatalFields)
    })
  })

  describe('validationSchema', () => {
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
      it('accepts valid ROW_ID at minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: ROW_ID_MINIMUM })
        expect(error).toBeUndefined()
      })

      it('rejects ROW_ID below minimum', () => {
        const { error } = validationSchema.validate({
          ROW_ID: ROW_ID_MINIMUM - 1
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe(
          `must be at least ${ROW_ID_MINIMUM}`
        )
      })
    })

    describe('DATE_LOAD_LEFT_SITE validation', () => {
      it('accepts valid Date object', () => {
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: new Date('2024-06-15')
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
      it('accepts valid weight', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 500.5
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
    })
  })

  describe('different ROW_ID minimums', () => {
    it('uses provided minimum for exporter (4000)', () => {
      const exporterSchema = createSentOnLoadsSchema(4000)
      const { error } = exporterSchema.validationSchema.validate({
        ROW_ID: 3999
      })
      expect(error.details[0].message).toBe('must be at least 4000')
    })

    it('uses provided minimum for reprocessor-input (5000)', () => {
      const reprocessorSchema = createSentOnLoadsSchema(5000)
      const { error } = reprocessorSchema.validationSchema.validate({
        ROW_ID: 4999
      })
      expect(error.details[0].message).toBe('must be at least 5000')
    })
  })
})
