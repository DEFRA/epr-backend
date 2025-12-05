import { describe, expect, it } from 'vitest'
import { REPROCESSED_LOADS } from './reprocessed-loads.js'

describe('REPROCESSED_LOADS', () => {
  const schema = REPROCESSED_LOADS

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has requiredHeaders array with expected fields', () => {
      expect(schema.requiredHeaders).toContain('ROW_ID')
      expect(schema.requiredHeaders).toContain('PRODUCT_TONNAGE')
    })

    it('has unfilledValues object', () => {
      expect(typeof schema.unfilledValues).toBe('object')
    })

    it('has fatalFields array with ROW_ID and PRODUCT_TONNAGE', () => {
      expect(Array.isArray(schema.fatalFields)).toBe(true)
      expect(schema.fatalFields).toContain('ROW_ID')
      expect(schema.fatalFields).toContain('PRODUCT_TONNAGE')
    })

    it('has fieldsRequiredForWasteBalance array with PRODUCT_TONNAGE', () => {
      expect(Array.isArray(schema.fieldsRequiredForWasteBalance)).toBe(true)
      expect(schema.fieldsRequiredForWasteBalance).toContain('PRODUCT_TONNAGE')
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
      it('accepts valid ROW_ID at minimum (3000)', () => {
        const { error } = validationSchema.validate({ ROW_ID: 3000 })
        expect(error).toBeUndefined()
      })

      it('accepts valid ROW_ID above minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 3500 })
        expect(error).toBeUndefined()
      })

      it('rejects ROW_ID below minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 2999 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 3000')
      })

      it('rejects non-integer ROW_ID', () => {
        const { error } = validationSchema.validate({ ROW_ID: 3000.5 })
        expect(error).toBeDefined()
      })
    })

    describe('PRODUCT_TONNAGE validation', () => {
      it('accepts zero', () => {
        const { error } = validationSchema.validate({ PRODUCT_TONNAGE: 0 })
        expect(error).toBeUndefined()
      })

      it('accepts maximum value (1000)', () => {
        const { error } = validationSchema.validate({ PRODUCT_TONNAGE: 1000 })
        expect(error).toBeUndefined()
      })

      it('accepts value within range', () => {
        const { error } = validationSchema.validate({ PRODUCT_TONNAGE: 500.5 })
        expect(error).toBeUndefined()
      })

      it('rejects value below minimum (negative)', () => {
        const { error } = validationSchema.validate({ PRODUCT_TONNAGE: -1 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 0')
      })

      it('rejects value above maximum (1000)', () => {
        const { error } = validationSchema.validate({ PRODUCT_TONNAGE: 1001 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 1000')
      })

      it('rejects non-number', () => {
        const { error } = validationSchema.validate({
          PRODUCT_TONNAGE: 'not-a-number'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('multiple field validation', () => {
      it('reports all errors when multiple fields invalid', () => {
        const { error } = validationSchema.validate({
          ROW_ID: 2999,
          PRODUCT_TONNAGE: 1001
        })
        expect(error).toBeDefined()
        expect(error.details.length).toBe(2)
      })
    })
  })
})
