import { describe, expect, it } from 'vitest'
import { SENT_ON_LOADS } from './sent-on-loads.js'

describe('SENT_ON_LOADS', () => {
  const schema = SENT_ON_LOADS

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has requiredHeaders array with expected fields', () => {
      expect(schema.requiredHeaders).toContain('ROW_ID')
      expect(schema.requiredHeaders).toContain('DATE_LOAD_LEFT_SITE')
      expect(schema.requiredHeaders).toContain(
        'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
      )
    })

    it('has unfilledValues object', () => {
      expect(typeof schema.unfilledValues).toBe('object')
    })

    it('has fatalFields array with all validated fields', () => {
      expect(Array.isArray(schema.fatalFields)).toBe(true)
      expect(schema.fatalFields).toContain('ROW_ID')
      expect(schema.fatalFields).toContain('DATE_LOAD_LEFT_SITE')
      expect(schema.fatalFields).toContain(
        'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
      )
    })

    it('has fieldsRequiredForWasteBalance array', () => {
      expect(Array.isArray(schema.fieldsRequiredForWasteBalance)).toBe(true)
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
      it('accepts valid ROW_ID at minimum (4999)', () => {
        const { error } = validationSchema.validate({ ROW_ID: 4999 })
        expect(error).toBeUndefined()
      })

      it('accepts valid ROW_ID above minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 5500 })
        expect(error).toBeUndefined()
      })

      it('rejects ROW_ID below minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 4998 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 4999')
      })

      it('rejects non-integer ROW_ID', () => {
        const { error } = validationSchema.validate({ ROW_ID: 4999.5 })
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
          ROW_ID: 4998,
          DATE_LOAD_LEFT_SITE: 'not-a-date',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: -1
        })
        expect(error).toBeDefined()
        expect(error.details.length).toBe(3)
      })
    })
  })
})
