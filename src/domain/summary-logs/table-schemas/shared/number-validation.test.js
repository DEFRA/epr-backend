import { describe, expect, it } from 'vitest'
import { areNumbersEqual, isProductCorrect } from './number-validation.js'

describe('number-validation', () => {
  describe('areNumbersEqual', () => {
    describe('exact matches', () => {
      it('returns true for identical integers', () => {
        expect(areNumbersEqual(42, 42)).toBe(true)
      })

      it('returns true for identical floats', () => {
        expect(areNumbersEqual(3.14159, 3.14159)).toBe(true)
      })

      it('returns true for both zero', () => {
        expect(areNumbersEqual(0, 0)).toBe(true)
      })

      it('returns true for both negative zero and zero', () => {
        expect(areNumbersEqual(-0, 0)).toBe(true)
      })
    })

    describe('within tolerance', () => {
      it('returns true for numbers within default tolerance', () => {
        expect(areNumbersEqual(1.0000000001, 1.0)).toBe(true)
      })

      it('returns true for very small differences', () => {
        expect(areNumbersEqual(100.0000000005, 100.0)).toBe(true)
      })
    })

    describe('outside tolerance', () => {
      it('returns false for numbers clearly different', () => {
        expect(areNumbersEqual(1.0, 2.0)).toBe(false)
      })

      it('returns false for small but significant differences', () => {
        expect(areNumbersEqual(100.01, 100.02)).toBe(false)
      })

      it('returns false for numbers differing by 0.001', () => {
        expect(areNumbersEqual(375.375, 375.376)).toBe(false)
      })
    })

    describe('edge cases', () => {
      it('returns false when comparing with Infinity', () => {
        expect(areNumbersEqual(Infinity, 1000)).toBe(false)
      })

      it('returns false when comparing with -Infinity', () => {
        expect(areNumbersEqual(-Infinity, -1000)).toBe(false)
      })

      it('returns true when both are Infinity', () => {
        expect(areNumbersEqual(Infinity, Infinity)).toBe(true)
      })

      it('returns false when comparing with NaN', () => {
        expect(areNumbersEqual(NaN, NaN)).toBe(false)
      })

      it('returns false when one value is NaN', () => {
        expect(areNumbersEqual(NaN, 100)).toBe(false)
      })
    })

    describe('custom tolerance', () => {
      it('accepts custom tolerance value', () => {
        expect(areNumbersEqual(1.0, 1.05, 0.1)).toBe(true)
      })

      it('rejects values outside custom tolerance', () => {
        expect(areNumbersEqual(1.0, 1.05, 0.01)).toBe(false)
      })
    })
  })

  describe('isProductCorrect', () => {
    describe('correct calculations', () => {
      it('returns true when proportion equals product of inputs', () => {
        // 500 * 0.75 = 375
        expect(isProductCorrect(375, 500, 0.75)).toBe(true)
      })

      it('returns true for zero product', () => {
        // 0 * 0.5 = 0
        expect(isProductCorrect(0, 0, 0.5)).toBe(true)
      })

      it('returns true for zero multiplier', () => {
        // 500 * 0 = 0
        expect(isProductCorrect(0, 500, 0)).toBe(true)
      })

      it('returns true for decimal results', () => {
        // 500.5 * 0.75 = 375.375
        expect(isProductCorrect(375.375, 500.5, 0.75)).toBe(true)
      })

      it('returns true for small percentages', () => {
        // 1000 * 0.01 = 10
        expect(isProductCorrect(10, 1000, 0.01)).toBe(true)
      })

      it('returns true for 100% percentage', () => {
        // 500 * 1 = 500
        expect(isProductCorrect(500, 500, 1)).toBe(true)
      })
    })

    describe('incorrect calculations', () => {
      it('returns false when proportion is clearly wrong', () => {
        // 500 * 0.75 = 375, not 400
        expect(isProductCorrect(400, 500, 0.75)).toBe(false)
      })

      it('returns false when proportion is rounded incorrectly', () => {
        // 500.5 * 0.75 = 375.375, not 375.38 (rounded)
        expect(isProductCorrect(375.38, 500.5, 0.75)).toBe(false)
      })

      it('returns false when proportion is manually entered rounded value', () => {
        // 333.33 * 0.5 = 166.665, not 166.67
        expect(isProductCorrect(166.67, 333.33, 0.5)).toBe(false)
      })
    })

    describe('floating point handling', () => {
      it('handles 0.1 + 0.2 style floating point correctly', () => {
        // 0.1 * 0.7 = 0.07 (but JS gives 0.06999999999999999)
        // Our function should handle this
        const jsResult = 0.1 * 0.7
        expect(isProductCorrect(jsResult, 0.1, 0.7)).toBe(true)
      })

      it('handles typical spreadsheet values', () => {
        // Typical values from Excel
        expect(isProductCorrect(375.375, 500.5, 0.75)).toBe(true)
      })
    })

    describe('edge cases', () => {
      it('handles very small numbers', () => {
        expect(isProductCorrect(0.0001, 0.01, 0.01)).toBe(true)
      })

      it('handles maximum tonnage with 100% percentage', () => {
        expect(isProductCorrect(1000, 1000, 1)).toBe(true)
      })
    })
  })
})
