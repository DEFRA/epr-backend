import { describe, expect, it } from 'vitest'
import {
  CLASSIFICATION_REASON,
  checkRequiredFields,
  createDateOnlyClassifier
} from './classify-helpers.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'

describe('classify-helpers', () => {
  describe('CLASSIFICATION_REASON', () => {
    it('exports MISSING_REQUIRED_FIELD', () => {
      expect(CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD).toBe(
        'MISSING_REQUIRED_FIELD'
      )
    })

    it('exports PRN_ISSUED', () => {
      expect(CLASSIFICATION_REASON.PRN_ISSUED).toBe('PRN_ISSUED')
    })

    it('exports OUTSIDE_ACCREDITATION_PERIOD', () => {
      expect(CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD).toBe(
        'OUTSIDE_ACCREDITATION_PERIOD'
      )
    })

    it('exports PRODUCT_WEIGHT_NOT_ADDED', () => {
      expect(CLASSIFICATION_REASON.PRODUCT_WEIGHT_NOT_ADDED).toBe(
        'PRODUCT_WEIGHT_NOT_ADDED'
      )
    })

    it('is frozen', () => {
      expect(Object.isFrozen(CLASSIFICATION_REASON)).toBe(true)
    })
  })

  describe('checkRequiredFields', () => {
    it('returns null when all required fields are filled', () => {
      const data = { FIELD_A: 'value', FIELD_B: 123 }
      const result = checkRequiredFields(data, ['FIELD_A', 'FIELD_B'], {})
      expect(result).toBeNull()
    })

    it('returns EXCLUDED with missing field reasons when a required field is missing', () => {
      const data = { FIELD_A: 'value' }
      const result = checkRequiredFields(data, ['FIELD_A', 'FIELD_B'], {})
      expect(result).toEqual({
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: [
          {
            code: CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD,
            field: 'FIELD_B'
          }
        ]
      })
    })

    it('returns EXCLUDED with all missing fields listed', () => {
      const data = {}
      const result = checkRequiredFields(data, ['FIELD_A', 'FIELD_B'], {})
      expect(result).toEqual({
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: [
          {
            code: CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD,
            field: 'FIELD_A'
          },
          {
            code: CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD,
            field: 'FIELD_B'
          }
        ]
      })
    })

    it('treats null as unfilled', () => {
      const data = { FIELD_A: null }
      const result = checkRequiredFields(data, ['FIELD_A'], {})
      expect(result).not.toBeNull()
      expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
    })

    it('treats empty string as unfilled', () => {
      const data = { FIELD_A: '' }
      const result = checkRequiredFields(data, ['FIELD_A'], {})
      expect(result).not.toBeNull()
      expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
    })

    it('treats undefined as unfilled', () => {
      const data = { FIELD_A: undefined }
      const result = checkRequiredFields(data, ['FIELD_A'], {})
      expect(result).not.toBeNull()
      expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
    })

    it('treats field-specific unfilled values as unfilled', () => {
      const data = { DROPDOWN: 'Choose option' }
      const unfilledValues = { DROPDOWN: ['Choose option'] }
      const result = checkRequiredFields(data, ['DROPDOWN'], unfilledValues)
      expect(result).not.toBeNull()
      expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
    })

    it('treats zero as filled', () => {
      const data = { FIELD_A: 0 }
      const result = checkRequiredFields(data, ['FIELD_A'], {})
      expect(result).toBeNull()
    })

    it('returns null for empty required fields list', () => {
      const data = {}
      const result = checkRequiredFields(data, [], {})
      expect(result).toBeNull()
    })
  })

  describe('createDateOnlyClassifier', () => {
    const accreditation = {
      validFrom: new Date('2024-01-01'),
      validTo: new Date('2024-12-31')
    }

    it('returns IGNORED when date is outside accreditation period', () => {
      const classify = createDateOnlyClassifier('MY_DATE')
      const data = { MY_DATE: new Date('2023-06-15') }

      const result = classify(data, { accreditation })

      expect(result).toEqual({
        outcome: ROW_OUTCOME.IGNORED,
        reasons: [{ code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD }]
      })
    })

    it('returns EXCLUDED when date is within accreditation period', () => {
      const classify = createDateOnlyClassifier('MY_DATE')
      const data = { MY_DATE: new Date('2024-06-15') }

      const result = classify(data, { accreditation })

      expect(result).toEqual({ outcome: ROW_OUTCOME.EXCLUDED, reasons: [] })
    })

    it('returns EXCLUDED when date field is not present', () => {
      const classify = createDateOnlyClassifier('MY_DATE')
      const data = {}

      const result = classify(data, { accreditation })

      expect(result).toEqual({ outcome: ROW_OUTCOME.EXCLUDED, reasons: [] })
    })

    it('returns EXCLUDED when date field is null', () => {
      const classify = createDateOnlyClassifier('MY_DATE')
      const data = { MY_DATE: null }

      const result = classify(data, { accreditation })

      expect(result).toEqual({ outcome: ROW_OUTCOME.EXCLUDED, reasons: [] })
    })

    it('returns EXCLUDED when date field is empty string', () => {
      const classify = createDateOnlyClassifier('MY_DATE')
      const data = { MY_DATE: '' }

      const result = classify(data, { accreditation })

      expect(result).toEqual({ outcome: ROW_OUTCOME.EXCLUDED, reasons: [] })
    })
  })
})
