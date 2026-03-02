import { describe, expect, it } from 'vitest'
import {
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createDateFieldSchema,
  createThreeDigitIdSchema,
  createPercentageFieldSchema,
  createFreeTextFieldSchema,
  createEnumFieldSchema
} from './field-schemas.js'

describe('field-schemas', () => {
  describe('createWeightFieldSchema', () => {
    it('accepts valid weight within default range (0-1000)', () => {
      const schema = createWeightFieldSchema()
      expect(schema.validate(500).error).toBeUndefined()
      expect(schema.validate(0).error).toBeUndefined()
      expect(schema.validate(1000).error).toBeUndefined()
    })

    it('rejects weight below 0', () => {
      const schema = createWeightFieldSchema()
      const { error } = schema.validate(-1)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be at least 0')
    })

    it('rejects weight above 1000', () => {
      const schema = createWeightFieldSchema()
      const { error } = schema.validate(1001)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be at most 1000')
    })

    it('rejects non-number', () => {
      const schema = createWeightFieldSchema()
      const { error } = schema.validate('abc')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be a number')
    })

    it('accepts custom max value', () => {
      const schema = createWeightFieldSchema(500)
      expect(schema.validate(500).error).toBeUndefined()
      expect(schema.validate(501).error).toBeDefined()
    })

    it('uses custom max message when provided', () => {
      const customMessage = 'must be at most 500'
      const schema = createWeightFieldSchema(500, customMessage)
      const { error } = schema.validate(501)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe(customMessage)
    })

    it('is optional', () => {
      const schema = createWeightFieldSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })
  })

  describe('createYesNoFieldSchema', () => {
    it('accepts Yes', () => {
      const schema = createYesNoFieldSchema()
      expect(schema.validate('Yes').error).toBeUndefined()
    })

    it('accepts No', () => {
      const schema = createYesNoFieldSchema()
      expect(schema.validate('No').error).toBeUndefined()
    })

    it('rejects other values', () => {
      const schema = createYesNoFieldSchema()
      const { error } = schema.validate('Maybe')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be Yes or No')
    })

    it('rejects non-string', () => {
      const schema = createYesNoFieldSchema()
      const { error } = schema.validate(123)
      expect(error).toBeDefined()
      // Joi returns any.only for non-strings since .valid() check runs first
      expect(error.details[0].message).toBe('must be Yes or No')
    })

    it('is optional', () => {
      const schema = createYesNoFieldSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })
  })

  describe('createDateFieldSchema', () => {
    it('accepts valid date', () => {
      const schema = createDateFieldSchema()
      expect(schema.validate(new Date()).error).toBeUndefined()
    })

    it('accepts date string', () => {
      const schema = createDateFieldSchema()
      expect(schema.validate('2024-01-01').error).toBeUndefined()
    })

    it('rejects invalid date', () => {
      const schema = createDateFieldSchema()
      const { error } = schema.validate('not-a-date')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be a valid date')
    })

    it('is optional', () => {
      const schema = createDateFieldSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })
  })

  describe('createThreeDigitIdSchema', () => {
    it('accepts 1 (minimum)', () => {
      const schema = createThreeDigitIdSchema()
      expect(schema.validate(1).error).toBeUndefined()
    })

    it('accepts 999', () => {
      const schema = createThreeDigitIdSchema()
      expect(schema.validate(999).error).toBeUndefined()
    })

    it('accepts 500', () => {
      const schema = createThreeDigitIdSchema()
      expect(schema.validate(500).error).toBeUndefined()
    })

    it('accepts 99', () => {
      const schema = createThreeDigitIdSchema()
      expect(schema.validate(99).error).toBeUndefined()
    })

    it('rejects 0 (too low)', () => {
      const schema = createThreeDigitIdSchema()
      const { error } = schema.validate(0)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe(
        'must be a number between 1 and 999'
      )
    })

    it('rejects negative numbers', () => {
      const schema = createThreeDigitIdSchema()
      const { error } = schema.validate(-1)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe(
        'must be a number between 1 and 999'
      )
    })

    it('rejects 1000 (too high)', () => {
      const schema = createThreeDigitIdSchema()
      const { error } = schema.validate(1000)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe(
        'must be a number between 1 and 999'
      )
    })

    it('rejects non-integer', () => {
      const schema = createThreeDigitIdSchema()
      const { error } = schema.validate(100.5)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe(
        'must be a number between 1 and 999'
      )
    })

    it('is optional', () => {
      const schema = createThreeDigitIdSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })
  })

  describe('createPercentageFieldSchema', () => {
    it('accepts 0', () => {
      const schema = createPercentageFieldSchema()
      expect(schema.validate(0).error).toBeUndefined()
    })

    it('accepts 1', () => {
      const schema = createPercentageFieldSchema()
      expect(schema.validate(1).error).toBeUndefined()
    })

    it('accepts 0.5', () => {
      const schema = createPercentageFieldSchema()
      expect(schema.validate(0.5).error).toBeUndefined()
    })

    it('rejects negative', () => {
      const schema = createPercentageFieldSchema()
      const { error } = schema.validate(-0.1)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be at least 0')
    })

    it('rejects above 1', () => {
      const schema = createPercentageFieldSchema()
      const { error } = schema.validate(1.1)
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be at most 1')
    })

    it('is optional', () => {
      const schema = createPercentageFieldSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })
  })

  describe('createFreeTextFieldSchema', () => {
    it('accepts standard alphanumeric string', () => {
      const schema = createFreeTextFieldSchema()
      expect(schema.validate('ABC123').error).toBeUndefined()
    })

    it('accepts string with spaces', () => {
      const schema = createFreeTextFieldSchema()
      expect(schema.validate('ABC 123').error).toBeUndefined()
    })

    it('accepts string with hyphens and common punctuation', () => {
      const schema = createFreeTextFieldSchema()
      expect(schema.validate('ABC-123/456').error).toBeUndefined()
    })

    it('accepts string with all printable ASCII characters', () => {
      const schema = createFreeTextFieldSchema()
      // Space (0x20) through tilde (0x7E) covers all printable ASCII
      expect(
        schema.validate('Hello, World! @#$%^&*()_+-=[]{}|;:\'",.<>?/~`').error
      ).toBeUndefined()
    })

    it('accepts string with newline characters', () => {
      const schema = createFreeTextFieldSchema()
      expect(schema.validate('Line 1\nLine 2').error).toBeUndefined()
      expect(schema.validate('Line 1\rLine 2').error).toBeUndefined()
      expect(schema.validate('Line 1\r\nLine 2').error).toBeUndefined()
    })

    it('accepts string with smart single quotes', () => {
      const schema = createFreeTextFieldSchema()
      // \u2018 = left single quote, \u2019 = right single quote
      expect(schema.validate('\u2018quoted\u2019').error).toBeUndefined()
    })

    it('accepts string with smart double quotes', () => {
      const schema = createFreeTextFieldSchema()
      // \u201C = left double quote, \u201D = right double quote
      expect(schema.validate('\u201Cquoted\u201D').error).toBeUndefined()
    })

    it('accepts string with en-dash and em-dash', () => {
      const schema = createFreeTextFieldSchema()
      // \u2013 = en-dash, \u2014 = em-dash
      expect(schema.validate('range\u2013value').error).toBeUndefined()
      expect(schema.validate('pause\u2014here').error).toBeUndefined()
    })

    it('accepts string with ellipsis character', () => {
      const schema = createFreeTextFieldSchema()
      // \u2026 = ellipsis
      expect(schema.validate('and so on\u2026').error).toBeUndefined()
    })

    it('accepts string with pound and euro signs', () => {
      const schema = createFreeTextFieldSchema()
      expect(schema.validate('\u00A3100').error).toBeUndefined()
      expect(schema.validate('\u20AC200').error).toBeUndefined()
    })

    it('rejects string with accented characters', () => {
      const schema = createFreeTextFieldSchema()
      const { error } = schema.validate('caf\u00E9')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe(
        'must contain only permitted characters'
      )
    })

    it('rejects string with non-English characters', () => {
      const schema = createFreeTextFieldSchema()
      const { error } = schema.validate('ni\u00F1o')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe(
        'must contain only permitted characters'
      )
    })

    it('rejects string with control characters', () => {
      const schema = createFreeTextFieldSchema()
      // \x00 = null, \x07 = bell
      const { error } = schema.validate('hello\x00world')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe(
        'must contain only permitted characters'
      )
    })

    it('rejects string with tab character', () => {
      const schema = createFreeTextFieldSchema()
      const { error } = schema.validate('hello\tworld')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe(
        'must contain only permitted characters'
      )
    })

    it('rejects string exceeding custom max length', () => {
      const schema = createFreeTextFieldSchema(10)
      const { error } = schema.validate('ABCDEFGHIJK')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be at most 10 characters')
    })

    it('accepts string at default max length (100 chars)', () => {
      const schema = createFreeTextFieldSchema()
      expect(schema.validate('A'.repeat(100)).error).toBeUndefined()
    })

    it('rejects string exceeding default max length (101 chars)', () => {
      const schema = createFreeTextFieldSchema()
      const { error } = schema.validate('A'.repeat(101))
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be at most 100 characters')
    })

    it('is optional', () => {
      const schema = createFreeTextFieldSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })

    it('coerces numeric value to string (e.g. customs code from ExcelJS)', () => {
      const schema = createFreeTextFieldSchema()
      const { error, value } = schema.validate(12345)
      expect(error).toBeUndefined()
      expect(value).toBe('12345')
    })
  })

  describe('createEnumFieldSchema', () => {
    const validValues = ['Option A', 'Option B', 'Option C']
    const invalidMessage = 'must be a valid option'

    it('accepts valid enum value', () => {
      const schema = createEnumFieldSchema(validValues, invalidMessage)
      expect(schema.validate('Option A').error).toBeUndefined()
      expect(schema.validate('Option B').error).toBeUndefined()
      expect(schema.validate('Option C').error).toBeUndefined()
    })

    it('rejects invalid enum value', () => {
      const schema = createEnumFieldSchema(validValues, invalidMessage)
      const { error } = schema.validate('Option D')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be a valid option')
    })

    it('rejects non-string', () => {
      const schema = createEnumFieldSchema(validValues, invalidMessage)
      const { error } = schema.validate(123)
      expect(error).toBeDefined()
      // Joi returns any.only for non-strings since .valid() check runs first
      expect(error.details[0].message).toBe('must be a valid option')
    })

    it('is optional', () => {
      const schema = createEnumFieldSchema(validValues, invalidMessage)
      expect(schema.validate(undefined).error).toBeUndefined()
    })

    it('coerces numeric value to string when enum values look like numbers', () => {
      // If enum values are numeric-looking strings like '1', '2', '3',
      // ExcelJS may return a number instead of the string
      const numericEnumValues = ['1', '2', '3']
      const schema = createEnumFieldSchema(
        numericEnumValues,
        'must be 1, 2, or 3'
      )
      const { error, value } = schema.validate(2)
      expect(error).toBeUndefined()
      expect(value).toBe('2')
    })
  })
})
