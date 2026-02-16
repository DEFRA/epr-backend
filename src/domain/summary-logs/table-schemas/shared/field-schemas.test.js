import { describe, expect, it } from 'vitest'
import {
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createDateFieldSchema,
  createThreeDigitIdSchema,
  createPercentageFieldSchema,
  createAlphanumericFieldSchema,
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

  describe('createAlphanumericFieldSchema', () => {
    it('accepts alphanumeric string', () => {
      const schema = createAlphanumericFieldSchema()
      expect(schema.validate('ABC123').error).toBeUndefined()
    })

    it('accepts single letter', () => {
      const schema = createAlphanumericFieldSchema()
      expect(schema.validate('A').error).toBeUndefined()
    })

    it('rejects string with spaces', () => {
      const schema = createAlphanumericFieldSchema()
      const { error } = schema.validate('ABC 123')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be alphanumeric')
    })

    it('rejects string with special characters', () => {
      const schema = createAlphanumericFieldSchema()
      const { error } = schema.validate('ABC-123')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be alphanumeric')
    })

    it('rejects string exceeding max length', () => {
      const schema = createAlphanumericFieldSchema(10)
      const { error } = schema.validate('ABCDEFGHIJK')
      expect(error).toBeDefined()
      expect(error.details[0].message).toBe('must be at most 100 characters')
    })

    it('is optional', () => {
      const schema = createAlphanumericFieldSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })

    it('coerces numeric value to string (e.g. postal code from ExcelJS)', () => {
      // ExcelJS may return a number if the cell looks numeric (e.g. postal code "12345")
      const schema = createAlphanumericFieldSchema()
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
