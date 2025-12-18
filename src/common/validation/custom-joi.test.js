import { describe, expect, it } from 'vitest'
import { customJoi } from './custom-joi.js'

describe('customJoi', () => {
  describe('coercedString type', () => {
    it('accepts string values unchanged', () => {
      const schema = customJoi.coercedString()
      const { error, value } = schema.validate('hello')
      expect(error).toBeUndefined()
      expect(value).toBe('hello')
    })

    it('coerces number to string', () => {
      const schema = customJoi.coercedString()
      const { error, value } = schema.validate(12345)
      expect(error).toBeUndefined()
      expect(value).toBe('12345')
    })

    it('coerces floating point number to string', () => {
      const schema = customJoi.coercedString()
      const { error, value } = schema.validate(3.14)
      expect(error).toBeUndefined()
      expect(value).toBe('3.14')
    })

    it('coerces zero to string', () => {
      const schema = customJoi.coercedString()
      const { error, value } = schema.validate(0)
      expect(error).toBeUndefined()
      expect(value).toBe('0')
    })

    it('coerces negative number to string', () => {
      const schema = customJoi.coercedString()
      const { error, value } = schema.validate(-42)
      expect(error).toBeUndefined()
      expect(value).toBe('-42')
    })

    it('supports chained string methods like max()', () => {
      const schema = customJoi.coercedString().max(5)
      expect(schema.validate('hello').error).toBeUndefined()
      expect(schema.validate('toolong').error).toBeDefined()
    })

    it('supports chained string methods like pattern()', () => {
      const schema = customJoi.coercedString().pattern(/^[A-Z]+$/)
      expect(schema.validate('ABC').error).toBeUndefined()
      expect(schema.validate('abc').error).toBeDefined()
    })

    it('supports valid() for enum-like behaviour', () => {
      const schema = customJoi.coercedString().valid('1', '2', '3')
      expect(schema.validate('1').error).toBeUndefined()
      expect(schema.validate(2).error).toBeUndefined()
      expect(schema.validate('4').error).toBeDefined()
    })

    it('allows undefined when optional', () => {
      const schema = customJoi.coercedString().optional()
      expect(schema.validate(undefined).error).toBeUndefined()
    })

    it('rejects undefined when required', () => {
      const schema = customJoi.coercedString().required()
      expect(schema.validate(undefined).error).toBeDefined()
    })
  })
})
