import { describe, expect, it } from 'vitest'
import Joi from 'joi'
import {
  isFilled,
  filterToFilled,
  classifyRow,
  ROW_OUTCOME
} from './validation-pipeline.js'

describe('validation-pipeline', () => {
  describe('ROW_OUTCOME', () => {
    it('exports outcome constants', () => {
      expect(ROW_OUTCOME.REJECTED).toBe('REJECTED')
      expect(ROW_OUTCOME.EXCLUDED).toBe('EXCLUDED')
      expect(ROW_OUTCOME.INCLUDED).toBe('INCLUDED')
    })
  })

  describe('isFilled', () => {
    it('returns false for null', () => {
      expect(isFilled(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isFilled(undefined)).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isFilled('')).toBe(false)
    })

    it('returns true for non-empty string', () => {
      expect(isFilled('value')).toBe(true)
    })

    it('returns true for number', () => {
      expect(isFilled(0)).toBe(true)
      expect(isFilled(123)).toBe(true)
    })

    it('returns true for boolean', () => {
      expect(isFilled(false)).toBe(true)
      expect(isFilled(true)).toBe(true)
    })

    it('returns false for value in unfilledValues array', () => {
      expect(isFilled('Please select...', ['Please select...'])).toBe(false)
    })

    it('returns true for value not in unfilledValues array', () => {
      expect(isFilled('Paper', ['Please select...'])).toBe(true)
    })

    it('returns false for any value in unfilledValues array', () => {
      expect(
        isFilled('-- Select --', ['Please select...', '-- Select --'])
      ).toBe(false)
    })
  })

  describe('filterToFilled', () => {
    it('removes null values', () => {
      const row = { A: 'value', B: null }
      const result = filterToFilled(row, {})
      expect(result).toEqual({ A: 'value' })
    })

    it('removes undefined values', () => {
      const row = { A: 'value', B: undefined }
      const result = filterToFilled(row, {})
      expect(result).toEqual({ A: 'value' })
    })

    it('removes empty string values', () => {
      const row = { A: 'value', B: '' }
      const result = filterToFilled(row, {})
      expect(result).toEqual({ A: 'value' })
    })

    it('keeps zero values', () => {
      const row = { A: 'value', B: 0 }
      const result = filterToFilled(row, {})
      expect(result).toEqual({ A: 'value', B: 0 })
    })

    it('removes field-specific unfilled values', () => {
      const row = { A: 'value', DROPDOWN: 'Please select...' }
      const unfilledValues = { DROPDOWN: ['Please select...'] }
      const result = filterToFilled(row, unfilledValues)
      expect(result).toEqual({ A: 'value' })
    })

    it('keeps field values not in unfilled list', () => {
      const row = { A: 'value', DROPDOWN: 'Paper' }
      const unfilledValues = { DROPDOWN: ['Please select...'] }
      const result = filterToFilled(row, unfilledValues)
      expect(result).toEqual({ A: 'value', DROPDOWN: 'Paper' })
    })
  })

  describe('classifyRow', () => {
    const createTestSchema = () => ({
      unfilledValues: {
        DROPDOWN: ['Please select...']
      },
      validationSchema: Joi.object({
        ROW_ID: Joi.number().min(10000).optional(),
        TEXT_FIELD: Joi.string().max(100).optional(),
        DROPDOWN: Joi.string().valid('Option A', 'Option B').optional()
      })
        .unknown(true)
        .prefs({ abortEarly: false }),
      fieldsRequiredForWasteBalance: ['ROW_ID', 'TEXT_FIELD']
    })

    describe('REJECTED outcome (VAL010 fails)', () => {
      it('returns REJECTED when filled field fails validation', () => {
        const schema = createTestSchema()
        const row = { ROW_ID: 9999, TEXT_FIELD: 'valid' }

        const result = classifyRow(row, schema)

        expect(result.outcome).toBe(ROW_OUTCOME.REJECTED)
        expect(result.issues).toBeDefined()
        expect(result.issues.length).toBeGreaterThan(0)
      })

      it('returns REJECTED with all validation errors', () => {
        const schema = createTestSchema()
        const row = { ROW_ID: 9999, DROPDOWN: 'Invalid Option' }

        const result = classifyRow(row, schema)

        expect(result.outcome).toBe(ROW_OUTCOME.REJECTED)
        expect(result.issues.length).toBe(2)
      })

      it('does not validate unfilled fields', () => {
        const schema = createTestSchema()
        // DROPDOWN has unfilled value, so should not be validated
        const row = { ROW_ID: 10000, DROPDOWN: 'Please select...' }

        const result = classifyRow(row, schema)

        // Should not be REJECTED because 'Please select...' is unfilled
        expect(result.outcome).not.toBe(ROW_OUTCOME.REJECTED)
      })
    })

    describe('EXCLUDED outcome (VAL011 fails)', () => {
      it('returns EXCLUDED when required field is missing', () => {
        const schema = createTestSchema()
        const row = { ROW_ID: 10000 } // TEXT_FIELD missing

        const result = classifyRow(row, schema)

        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.issues).toBeDefined()
        expect(result.issues[0].code).toBe('MISSING_REQUIRED_FIELD')
      })

      it('returns EXCLUDED when required field is unfilled', () => {
        const schema = createTestSchema()
        const row = { ROW_ID: 10000, TEXT_FIELD: '' }

        const result = classifyRow(row, schema)

        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
      })

      it('returns EXCLUDED with all missing fields listed', () => {
        const schema = createTestSchema()
        const row = {} // Both ROW_ID and TEXT_FIELD missing

        const result = classifyRow(row, schema)

        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.issues.length).toBe(2)
      })
    })

    describe('INCLUDED outcome (all validation passes)', () => {
      it('returns INCLUDED when all required fields present and valid', () => {
        const schema = createTestSchema()
        const row = { ROW_ID: 10000, TEXT_FIELD: 'value' }

        const result = classifyRow(row, schema)

        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.issues).toEqual([])
      })

      it('returns INCLUDED with extra valid fields', () => {
        const schema = createTestSchema()
        const row = {
          ROW_ID: 10000,
          TEXT_FIELD: 'value',
          DROPDOWN: 'Option A'
        }

        const result = classifyRow(row, schema)

        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })
    })

    describe('validation order (VAL010 before VAL011)', () => {
      it('returns REJECTED not EXCLUDED when field is invalid AND missing required fields', () => {
        const schema = createTestSchema()
        // ROW_ID invalid AND TEXT_FIELD missing
        const row = { ROW_ID: 9999 }

        const result = classifyRow(row, schema)

        // VAL010 should fail first, resulting in REJECTED
        expect(result.outcome).toBe(ROW_OUTCOME.REJECTED)
      })
    })
  })
})
