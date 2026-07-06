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
import { expectValidationError } from '#common/validation/validation-test-helpers.js'

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
      const details = expectValidationError(schema, -1)
      expect(details[0].message).toBe('must be at least 0')
    })

    it('rejects weight above 1000', () => {
      const schema = createWeightFieldSchema()
      const details = expectValidationError(schema, 1001)
      expect(details[0].message).toBe('must be at most 1000')
    })

    it('rejects non-number', () => {
      const schema = createWeightFieldSchema()
      const details = expectValidationError(schema, 'abc')
      expect(details[0].message).toBe('must be a number')
    })

    it('accepts custom max value', () => {
      const schema = createWeightFieldSchema(500)
      expect(schema.validate(500).error).toBeUndefined()
      expect(schema.validate(501).error).toBeDefined()
    })

    it('uses custom max message when provided', () => {
      const customMessage = 'must be at most 500'
      const schema = createWeightFieldSchema(500, customMessage)
      const details = expectValidationError(schema, 501)
      expect(details[0].message).toBe(customMessage)
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
      const details = expectValidationError(schema, 'Maybe')
      expect(details[0].message).toBe('must be Yes or No')
    })

    it('rejects non-string', () => {
      const schema = createYesNoFieldSchema()
      const details = expectValidationError(schema, 123)
      // Joi returns any.only for non-strings since .valid() check runs first
      expect(details[0].message).toBe('must be Yes or No')
    })

    it('is optional', () => {
      const schema = createYesNoFieldSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })
  })

  describe('createDateFieldSchema', () => {
    it.each([
      {
        description: 'YYYY-MM-DD string as-is',
        input: '2024-01-01',
        expected: '2024-01-01'
      },
      {
        description: 'minimum boundary date',
        input: '2000-01-01',
        expected: '2000-01-01'
      },
      {
        description: 'maximum boundary date',
        input: '2100-01-01',
        expected: '2100-01-01'
      },
      {
        description: 'a Date object, coerced to YYYY-MM-DD string',
        input: new Date('2024-06-15'),
        expected: '2024-06-15'
      },
      {
        description: 'an ISO timestamp string, extracting the date',
        input: '2024-06-15T00:00:00.000Z',
        expected: '2024-06-15'
      },
      {
        description: 'numeric epoch milliseconds, coerced to YYYY-MM-DD string',
        // 1704067200000 = 2024-01-01T00:00:00.000Z
        input: 1704067200000,
        expected: '2024-01-01'
      }
    ])('accepts $description', ({ input, expected }) => {
      const schema = createDateFieldSchema()
      const { error, value } = schema.validate(input)
      expect(error).toBeUndefined()
      expect(value).toBe(expected)
    })

    it.each([
      {
        description: 'numeric epoch seconds (outside valid range as millis)',
        // 1704067200 seconds = 1970-01-20 when interpreted as millis
        input: 1704067200
      },
      { description: 'NaN numeric value', input: NaN },
      { description: 'boolean value', input: true },
      {
        description: 'date that rolls over (e.g. Feb 30)',
        input: '2024-02-30'
      },
      { description: 'invalid date string', input: 'not-a-date' },
      { description: 'date before 2000', input: '1999-12-31' },
      { description: 'date after 2100', input: '2100-01-02' },
      { description: 'invalid year', input: '20256-01-02' }
    ])('rejects $description', ({ input }) => {
      const schema = createDateFieldSchema()
      const details = expectValidationError(schema, input)
      expect(details[0].message).toBe('must be a valid date')
    })

    it('is optional', () => {
      const schema = createDateFieldSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })
  })

  describe('createThreeDigitIdSchema', () => {
    it.each([
      {
        description: 'zero-pads numeric 1 to "001"',
        input: 1,
        expected: '001'
      },
      { description: 'keeps 999 as "999"', input: 999, expected: '999' },
      {
        description: 'zero-pads numeric 99 to "099"',
        input: 99,
        expected: '099'
      },
      {
        description: 'preserves string "099" as "099"',
        input: '099',
        expected: '099'
      },
      {
        description: 'zero-pads string "5" to "005"',
        input: '5',
        expected: '005'
      }
    ])('$description', ({ input, expected }) => {
      const schema = createThreeDigitIdSchema()
      const { error, value } = schema.validate(input)
      expect(error).toBeUndefined()
      expect(value).toBe(expected)
    })

    it.each([
      { description: '0 (too low)', input: 0 },
      { description: 'negative numbers', input: -1 },
      { description: '1000 (too high)', input: 1000 },
      { description: 'non-integer', input: 100.5 },
      { description: 'non-numeric string', input: 'ABC' }
    ])('rejects $description', ({ input }) => {
      const schema = createThreeDigitIdSchema()
      const details = expectValidationError(schema, input)
      expect(details[0].message).toBe('must be a 3-digit ID (001-999)')
    })

    it('is optional', () => {
      const schema = createThreeDigitIdSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })
  })

  describe('createPercentageFieldSchema', () => {
    it.each([0, 1, 0.5])('accepts %s', (input) => {
      const schema = createPercentageFieldSchema()
      expect(schema.validate(input).error).toBeUndefined()
    })

    it('rejects negative', () => {
      const schema = createPercentageFieldSchema()
      const details = expectValidationError(schema, -0.1)
      expect(details[0].message).toBe('must be at least 0')
    })

    it('rejects above 1', () => {
      const schema = createPercentageFieldSchema()
      const details = expectValidationError(schema, 1.1)
      expect(details[0].message).toBe('must be at most 1')
    })

    it('is optional', () => {
      const schema = createPercentageFieldSchema()
      expect(schema.validate(undefined).error).toBeUndefined()
    })
  })

  describe('createFreeTextFieldSchema', () => {
    it.each([
      { description: 'standard alphanumeric string', input: 'ABC123' },
      { description: 'string with spaces', input: 'ABC 123' },
      {
        description: 'string with hyphens and common punctuation',
        input: 'ABC-123/456'
      },
      {
        description: 'string with all printable ASCII characters',
        // Space (0x20) through tilde (0x7E) covers all printable ASCII
        input: 'Hello, World! @#$%^&*()_+-=[]{}|;:\'",.<>?/~`'
      },
      {
        // \u2018 = left single quote, \u2019 = right single quote
        description: 'string with smart single quotes',
        input: '\u2018quoted\u2019'
      },
      {
        // \u201C = left double quote, \u201D = right double quote
        description: 'string with smart double quotes',
        input: '\u201Cquoted\u201D'
      },
      {
        // \u2026 = ellipsis
        description: 'string with ellipsis character',
        input: 'and so on\u2026'
      },
      {
        // \u00AD = soft hyphen, invisible word-break hint from Word copy-paste
        description: 'string with soft hyphens',
        input: 'ABC\u00AD123'
      },
      {
        description: 'string with en-dash', // \u2013 = en-dash
        input: 'range\u2013value'
      },
      {
        description: 'string with em-dash', // \u2014 = em-dash
        input: 'pause\u2014here'
      },
      { description: 'string with pound sign', input: '\u00A3100' },
      { description: 'string with euro sign', input: '\u20AC200' },
      {
        // \u00A0 = non-breaking space, commonly inserted by Excel/Word
        description: 'string with a non-breaking space mid-word',
        input: 'ABC123\u00A0/ DEF456'
      },
      {
        description: 'string with repeated non-breaking spaces',
        input: 'AB\u00A0 \u00A0/CD123'
      }
    ])('accepts $description', ({ input }) => {
      const schema = createFreeTextFieldSchema()
      expect(schema.validate(input).error).toBeUndefined()
    })

    it('accepts string with newline characters', () => {
      const schema = createFreeTextFieldSchema()
      expect(schema.validate('Line 1\nLine 2').error).toBeUndefined()
      expect(schema.validate('Line 1\rLine 2').error).toBeUndefined()
      expect(schema.validate('Line 1\r\nLine 2').error).toBeUndefined()
    })

    it.each([
      { description: 'string with accented characters', input: 'caf\u00E9' },
      {
        description: 'string with non-English characters',
        input: 'ni\u00F1o'
      },
      {
        // \x00 = null, \x07 = bell
        description: 'string with control characters',
        input: 'hello\x00world'
      },
      { description: 'string with tab character', input: 'hello\tworld' }
    ])('rejects $description', ({ input }) => {
      const schema = createFreeTextFieldSchema()
      const details = expectValidationError(schema, input)
      expect(details[0].message).toBe('must contain only permitted characters')
    })

    it('rejects string exceeding custom max length', () => {
      const schema = createFreeTextFieldSchema(10)
      const details = expectValidationError(schema, 'ABCDEFGHIJK')
      expect(details[0].message).toBe('must be at most 10 characters')
    })

    it('accepts string at default max length (100 chars)', () => {
      const schema = createFreeTextFieldSchema()
      expect(schema.validate('A'.repeat(100)).error).toBeUndefined()
    })

    it('rejects string exceeding default max length (101 chars)', () => {
      const schema = createFreeTextFieldSchema()
      const details = expectValidationError(schema, 'A'.repeat(101))
      expect(details[0].message).toBe('must be at most 100 characters')
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
      const details = expectValidationError(schema, 'Option D')
      expect(details[0].message).toBe('must be a valid option')
    })

    it('rejects non-string', () => {
      const schema = createEnumFieldSchema(validValues, invalidMessage)
      const details = expectValidationError(schema, 123)
      // Joi returns any.only for non-strings since .valid() check runs first
      expect(details[0].message).toBe('must be a valid option')
    })

    it('is optional', () => {
      const schema = createEnumFieldSchema(validValues, invalidMessage)
      expect(schema.validate(undefined).error).toBeUndefined()
    })

    it.each([
      {
        description: 'leading whitespace',
        input: ' Option A',
        expected: 'Option A'
      },
      {
        description: 'trailing whitespace',
        input: 'Option B ',
        expected: 'Option B'
      },
      {
        description: 'leading and trailing whitespace',
        input: '  Option C  ',
        expected: 'Option C'
      }
    ])('accepts value with $description by trimming', ({ input, expected }) => {
      const schema = createEnumFieldSchema(validValues, invalidMessage)
      const { error, value } = schema.validate(input)
      expect(error).toBeUndefined()
      expect(value).toBe(expected)
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
