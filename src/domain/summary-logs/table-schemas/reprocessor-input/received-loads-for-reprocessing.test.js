import { describe, expect, it } from 'vitest'
import { RECEIVED_LOADS_FOR_REPROCESSING } from './received-loads-for-reprocessing.js'

describe('RECEIVED_LOADS_FOR_REPROCESSING', () => {
  const schema = RECEIVED_LOADS_FOR_REPROCESSING

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has requiredHeaders array with expected fields', () => {
      expect(schema.requiredHeaders).toContain('ROW_ID')
      expect(schema.requiredHeaders).toContain('DATE_RECEIVED_FOR_REPROCESSING')
      expect(schema.requiredHeaders).toContain('EWC_CODE')
      expect(schema.requiredHeaders).toContain('GROSS_WEIGHT')
    })

    it('has unfilledValues object', () => {
      expect(typeof schema.unfilledValues).toBe('object')
    })

    it('has fieldsRequiredForWasteBalance array', () => {
      expect(Array.isArray(schema.fieldsRequiredForWasteBalance)).toBe(true)
      expect(schema.fieldsRequiredForWasteBalance).toContain('EWC_CODE')
      expect(schema.fieldsRequiredForWasteBalance).toContain(
        'TONNAGE_RECEIVED_FOR_RECYCLING'
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

    describe('ROW_ID validation', () => {
      it('accepts valid ROW_ID', () => {
        const { error } = validationSchema.validate({ ROW_ID: 10000 })
        expect(error).toBeUndefined()
      })

      it('rejects ROW_ID below minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 9999 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 10000')
      })

      it('rejects non-integer ROW_ID', () => {
        const { error } = validationSchema.validate({ ROW_ID: 10000.5 })
        expect(error).toBeDefined()
      })
    })

    describe('DATE_RECEIVED_FOR_REPROCESSING validation', () => {
      it('accepts valid date', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_FOR_REPROCESSING: new Date('2024-01-15')
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid date', () => {
        const { error } = validationSchema.validate({
          DATE_RECEIVED_FOR_REPROCESSING: 'not-a-date'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a valid date')
      })
    })

    describe('EWC_CODE validation', () => {
      it('accepts valid EWC code', () => {
        const { error } = validationSchema.validate({ EWC_CODE: '03 03 08' })
        expect(error).toBeUndefined()
      })

      it('rejects invalid EWC code format', () => {
        const { error } = validationSchema.validate({ EWC_CODE: '030308' })
        expect(error).toBeDefined()
        expect(error.details[0].message).toContain('must be in format')
      })
    })

    describe('weight field validation', () => {
      it('accepts positive GROSS_WEIGHT', () => {
        const { error } = validationSchema.validate({ GROSS_WEIGHT: 100 })
        expect(error).toBeUndefined()
      })

      it('rejects zero GROSS_WEIGHT', () => {
        const { error } = validationSchema.validate({ GROSS_WEIGHT: 0 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be greater than 0')
      })

      it('rejects negative GROSS_WEIGHT', () => {
        const { error } = validationSchema.validate({ GROSS_WEIGHT: -1 })
        expect(error).toBeDefined()
      })

      it('rejects non-number GROSS_WEIGHT', () => {
        const { error } = validationSchema.validate({ GROSS_WEIGHT: 'heavy' })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('RECYCLABLE_PROPORTION_PERCENTAGE validation', () => {
      it('accepts value between 0 and 1', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: 0.5
        })
        expect(error).toBeUndefined()
      })

      it('rejects value of 0', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: 0
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be greater than 0')
      })

      it('rejects value of 1 or greater', () => {
        const { error } = validationSchema.validate({
          RECYCLABLE_PROPORTION_PERCENTAGE: 1
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be less than 1')
      })
    })

    describe('multiple field validation', () => {
      it('reports all errors when multiple fields invalid', () => {
        const { error } = validationSchema.validate({
          ROW_ID: 9999,
          GROSS_WEIGHT: 0
        })
        expect(error).toBeDefined()
        expect(error.details.length).toBe(2)
      })
    })
  })
})
