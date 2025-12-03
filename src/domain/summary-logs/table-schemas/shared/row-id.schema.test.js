import { describe, expect, it } from 'vitest'
import { createRowIdSchema } from './row-id.schema.js'

describe('row-id.schema', () => {
  describe('createRowIdSchema', () => {
    const schema = createRowIdSchema()

    it('returns a Joi schema', () => {
      expect(typeof schema.validate).toBe('function')
    })

    it('accepts valid ROW_ID at minimum value', () => {
      const { error } = schema.validate(10000)
      expect(error).toBeUndefined()
    })

    it('accepts valid ROW_ID above minimum', () => {
      const { error } = schema.validate(12345)
      expect(error).toBeUndefined()
    })

    it('rejects ROW_ID below minimum', () => {
      const { error } = schema.validate(9999)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be at least 10000')
    })

    it('rejects non-integer ROW_ID', () => {
      const { error } = schema.validate(10000.5)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be an integer')
    })

    it('coerces numeric string to number (Joi default behaviour)', () => {
      const { error, value } = schema.validate('10000')
      expect(error).toBeUndefined()
      expect(value).toBe(10000)
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
})
