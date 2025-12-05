import { describe, expect, it } from 'vitest'
import { createRowIdSchema } from './row-id.schema.js'

describe('row-id.schema', () => {
  describe('createRowIdSchema', () => {
    describe('with minimum of 1000', () => {
      const schema = createRowIdSchema(1000)

      it('returns a Joi schema', () => {
        expect(typeof schema.validate).toBe('function')
      })

      it('accepts valid ROW_ID at minimum value', () => {
        const { error } = schema.validate(1000)
        expect(error).toBeUndefined()
      })

      it('accepts valid ROW_ID above minimum', () => {
        const { error } = schema.validate(1234)
        expect(error).toBeUndefined()
      })

      it('rejects ROW_ID below minimum', () => {
        const { error } = schema.validate(999)
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 1000')
      })

      it('rejects non-integer ROW_ID', () => {
        const { error } = schema.validate(1000.5)
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be an integer')
      })

      it('coerces numeric string to number (Joi default behaviour)', () => {
        const { error, value } = schema.validate('1000')
        expect(error).toBeUndefined()
        expect(value).toBe(1000)
      })

      it('rejects non-numeric string', () => {
        const { error } = schema.validate('abc')
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })

      it('rejects null ROW_ID', () => {
        const { error } = schema.validate(null)
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('with minimum of 3000', () => {
      const schema = createRowIdSchema(3000)

      it('accepts valid ROW_ID at minimum value', () => {
        const { error } = schema.validate(3000)
        expect(error).toBeUndefined()
      })

      it('rejects ROW_ID below minimum', () => {
        const { error } = schema.validate(2999)
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 3000')
      })
    })
  })
})
