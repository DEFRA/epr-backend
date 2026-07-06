import { describe, expect, it } from 'vitest'
import { customJoi } from './custom-joi.js'

describe('customJoi', () => {
  describe('coercedString type', () => {
    it.each([
      ['accepts string values unchanged', 'hello', 'hello'],
      ['coerces number to string', 12345, '12345'],
      ['coerces floating point number to string', 3.14, '3.14'],
      ['coerces zero to string', 0, '0'],
      ['coerces negative number to string', -42, '-42']
    ])('%s', (_description, input, expected) => {
      const schema = customJoi.coercedString()
      const { error, value } = schema.validate(input)
      expect(error).toBeUndefined()
      expect(value).toBe(expected)
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
