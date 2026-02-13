import { describe, it, expect } from 'vitest'
import Decimal from 'decimal.js'
import {
  toDecimal,
  toNumber,
  add,
  subtract,
  equals,
  abs,
  greaterThan,
  isZero
} from './decimal-utils.js'

describe('decimal-utils', () => {
  describe('toDecimal', () => {
    it('should convert a number to Decimal', () => {
      const result = toDecimal(42)
      expect(result).toBeInstanceOf(Decimal)
      expect(result.toNumber()).toBe(42)
    })

    it('should convert a string to Decimal', () => {
      const result = toDecimal('42.5')
      expect(result).toBeInstanceOf(Decimal)
      expect(result.toNumber()).toBe(42.5)
    })

    it('should return the same Decimal instance if already a Decimal', () => {
      const decimal = new Decimal(42)
      const result = toDecimal(decimal)
      expect(result).toBe(decimal)
    })

    it('should return Decimal 0 for null', () => {
      const result = toDecimal(null)
      expect(result).toBeInstanceOf(Decimal)
      expect(result.toNumber()).toBe(0)
    })

    it('should return Decimal 0 for undefined', () => {
      const result = toDecimal(undefined)
      expect(result).toBeInstanceOf(Decimal)
      expect(result.toNumber()).toBe(0)
    })

    it('should handle negative numbers', () => {
      const result = toDecimal(-42.5)
      expect(result.toNumber()).toBe(-42.5)
    })

    it('should handle zero', () => {
      const result = toDecimal(0)
      expect(result.toNumber()).toBe(0)
    })

    it('should handle very large numbers', () => {
      const largeNumber = '999999999999999999999999999999.123'
      const result = toDecimal(largeNumber)
      // Decimal.js uses scientific notation for very large numbers
      expect(result.toFixed()).toContain('999999999999999999999999999999')
    })

    it('should handle very small decimal numbers', () => {
      const smallNumber = '0.000000000000000000000000000001'
      const result = toDecimal(smallNumber)
      // Decimal.js uses scientific notation for very small numbers
      expect(result.toNumber()).toBe(1e-30)
    })
  })

  describe('toNumber', () => {
    it('should convert a Decimal to number', () => {
      const decimal = new Decimal(42.5)
      const result = toNumber(decimal)
      expect(result).toBe(42.5)
      expect(typeof result).toBe('number')
    })

    it('should return 0 for null', () => {
      const result = toNumber(null)
      expect(result).toBe(0)
    })

    it('should return 0 for undefined', () => {
      const result = toNumber(undefined)
      expect(result).toBe(0)
    })

    it('should convert a number to number', () => {
      const result = toNumber(42.5)
      expect(result).toBe(42.5)
    })

    it('should convert a string to number', () => {
      const result = toNumber('42.5')
      expect(result).toBe(42.5)
    })

    it('should handle negative numbers', () => {
      const result = toNumber(new Decimal(-42.5))
      expect(result).toBe(-42.5)
    })

    it('should handle zero', () => {
      const result = toNumber(new Decimal(0))
      expect(result).toBe(0)
    })
  })

  describe('add', () => {
    it('should add two numbers', () => {
      const result = add(10, 5)
      expect(result).toBeInstanceOf(Decimal)
      expect(result.toNumber()).toBe(15)
    })

    it('should add two strings', () => {
      const result = add('10.5', '5.3')
      expect(result.toNumber()).toBe(15.8)
    })

    it('should add two Decimals', () => {
      const result = add(new Decimal(10), new Decimal(5))
      expect(result.toNumber()).toBe(15)
    })

    it('should add mixed types', () => {
      const result = add(10, '5.5')
      expect(result.toNumber()).toBe(15.5)
    })

    it('should handle negative numbers', () => {
      const result = add(10, -5)
      expect(result.toNumber()).toBe(5)
    })

    it('should handle adding zero', () => {
      const result = add(10, 0)
      expect(result.toNumber()).toBe(10)
    })

    it('should avoid floating point precision issues', () => {
      // 0.1 + 0.2 = 0.30000000000000004 in JavaScript
      const result = add(0.1, 0.2)
      expect(result.toNumber()).toBe(0.3)
    })

    it('should handle very large numbers', () => {
      const result = add('999999999999999999', '1')
      expect(result.toString()).toBe('1000000000000000000')
    })
  })

  describe('subtract', () => {
    it('should subtract two numbers', () => {
      const result = subtract(10, 5)
      expect(result).toBeInstanceOf(Decimal)
      expect(result.toNumber()).toBe(5)
    })

    it('should subtract two strings', () => {
      const result = subtract('10.5', '5.3')
      expect(result.toNumber()).toBe(5.2)
    })

    it('should subtract two Decimals', () => {
      const result = subtract(new Decimal(10), new Decimal(5))
      expect(result.toNumber()).toBe(5)
    })

    it('should subtract mixed types', () => {
      const result = subtract(10, '5.5')
      expect(result.toNumber()).toBe(4.5)
    })

    it('should handle negative results', () => {
      const result = subtract(5, 10)
      expect(result.toNumber()).toBe(-5)
    })

    it('should handle subtracting zero', () => {
      const result = subtract(10, 0)
      expect(result.toNumber()).toBe(10)
    })

    it('should avoid floating point precision issues', () => {
      // 0.3 - 0.2 = 0.09999999999999998 in JavaScript
      const result = subtract(0.3, 0.2)
      expect(result.toNumber()).toBe(0.1)
    })

    it('should handle subtracting negative numbers', () => {
      const result = subtract(10, -5)
      expect(result.toNumber()).toBe(15)
    })
  })

  describe('equals', () => {
    it('should return true for equal numbers', () => {
      expect(equals(10, 10)).toBe(true)
    })

    it('should return false for different numbers', () => {
      expect(equals(10, 5)).toBe(false)
    })

    it('should return true for equal strings', () => {
      expect(equals('10.5', '10.5')).toBe(true)
    })

    it('should return true for equal Decimals', () => {
      expect(equals(new Decimal(10), new Decimal(10))).toBe(true)
    })

    it('should return true for mixed types with same value', () => {
      expect(equals(10, '10')).toBe(true)
    })

    it('should handle floating point precision issues', () => {
      // In JavaScript: 0.1 + 0.2 !== 0.3
      const sum = 0.1 + 0.2
      expect(sum === 0.3).toBe(false) // JavaScript fails
      expect(equals(add(0.1, 0.2), 0.3)).toBe(true) // Our function succeeds
    })

    it('should handle negative numbers', () => {
      expect(equals(-10, -10)).toBe(true)
      expect(equals(-10, 10)).toBe(false)
    })

    it('should handle zero', () => {
      expect(equals(0, 0)).toBe(true)
      expect(equals(0, '0')).toBe(true)
    })

    it('should handle very precise decimals', () => {
      expect(equals('10.000000000001', '10.000000000001')).toBe(true)
      expect(equals('10.000000000001', '10.000000000002')).toBe(false)
    })
  })

  describe('abs', () => {
    it('should return absolute value of positive number', () => {
      const result = abs(10)
      expect(result).toBeInstanceOf(Decimal)
      expect(result.toNumber()).toBe(10)
    })

    it('should return absolute value of negative number', () => {
      const result = abs(-10)
      expect(result.toNumber()).toBe(10)
    })

    it('should handle zero', () => {
      const result = abs(0)
      expect(result.toNumber()).toBe(0)
    })

    it('should handle string input', () => {
      const result = abs('-42.5')
      expect(result.toNumber()).toBe(42.5)
    })

    it('should handle Decimal input', () => {
      const result = abs(new Decimal(-42.5))
      expect(result.toNumber()).toBe(42.5)
    })

    it('should handle very large negative numbers', () => {
      const result = abs('-999999999999999999')
      expect(result.toString()).toBe('999999999999999999')
    })
  })

  describe('greaterThan', () => {
    it('should return true when first value is greater', () => {
      expect(greaterThan(10, 5)).toBe(true)
    })

    it('should return false when first value is less', () => {
      expect(greaterThan(5, 10)).toBe(false)
    })

    it('should return false when values are equal', () => {
      expect(greaterThan(10, 10)).toBe(false)
    })

    it('should handle string inputs', () => {
      expect(greaterThan('10.5', '5.3')).toBe(true)
      expect(greaterThan('5.3', '10.5')).toBe(false)
    })

    it('should handle Decimal inputs', () => {
      expect(greaterThan(new Decimal(10), new Decimal(5))).toBe(true)
    })

    it('should handle mixed types', () => {
      expect(greaterThan(10, '5')).toBe(true)
      expect(greaterThan('5', 10)).toBe(false)
    })

    it('should handle negative numbers', () => {
      expect(greaterThan(-5, -10)).toBe(true)
      expect(greaterThan(-10, -5)).toBe(false)
      expect(greaterThan(5, -10)).toBe(true)
      expect(greaterThan(-10, 5)).toBe(false)
    })

    it('should handle zero', () => {
      expect(greaterThan(1, 0)).toBe(true)
      expect(greaterThan(0, 1)).toBe(false)
      expect(greaterThan(0, 0)).toBe(false)
    })

    it('should avoid floating point precision issues', () => {
      expect(greaterThan(0.3, 0.2)).toBe(true)
      expect(greaterThan(0.1, 0.2)).toBe(false)
    })
  })

  describe('isZero', () => {
    it('should return true for zero number', () => {
      expect(isZero(0)).toBe(true)
    })

    it('should return true for zero string', () => {
      expect(isZero('0')).toBe(true)
    })

    it('should return true for zero Decimal', () => {
      expect(isZero(new Decimal(0))).toBe(true)
    })

    it('should return false for positive number', () => {
      expect(isZero(1)).toBe(false)
    })

    it('should return false for negative number', () => {
      expect(isZero(-1)).toBe(false)
    })

    it('should return false for very small positive number', () => {
      expect(isZero(0.0000001)).toBe(false)
    })

    it('should return false for very small negative number', () => {
      expect(isZero(-0.0000001)).toBe(false)
    })

    it('should handle string representations of zero', () => {
      expect(isZero('0.0')).toBe(true)
      expect(isZero('0.00')).toBe(true)
    })

    it('should handle result of subtraction', () => {
      const result = subtract(10, 10)
      expect(isZero(result)).toBe(true)
    })

    it('should handle result of addition to zero', () => {
      const result = add(5, -5)
      expect(isZero(result)).toBe(true)
    })
  })

  describe('Decimal configuration', () => {
    it('should use ROUND_HALF_UP rounding mode', () => {
      // Create a calculation that requires rounding
      const value = new Decimal('2.5')
      const rounded = value.toDecimalPlaces(0)
      expect(rounded.toNumber()).toBe(3) // ROUND_HALF_UP rounds 2.5 to 3
    })

    it('should use ROUND_HALF_UP for negative values', () => {
      const value = new Decimal('-2.5')
      const rounded = value.toDecimalPlaces(0)
      expect(rounded.toNumber()).toBe(-3) // ROUND_HALF_UP rounds -2.5 to -3
    })

    it('should support 34 digits precision', () => {
      // Test that we can handle MongoDB Decimal128 precision
      const value = new Decimal('1.2345678901234567890123456789012345')
      expect(value.toString()).toContain('1.234567890123456789012345678901234')
    })
  })

  describe('Integration tests', () => {
    it('should handle complex financial calculations', () => {
      // Scenario: Calculate balance with multiple operations
      const initial = toDecimal('1000.50')
      const deposit1 = add(initial, '250.75')
      const deposit2 = add(deposit1, '100.25')
      const withdrawal = subtract(deposit2, '500.00')

      expect(equals(withdrawal, '851.50')).toBe(true)
      expect(toNumber(withdrawal)).toBe(851.5)
    })

    it('should avoid floating point errors in sequential operations', () => {
      // This would fail with regular JavaScript math
      let result = toDecimal(0)
      for (let i = 0; i < 10; i++) {
        result = add(result, 0.1)
      }
      expect(equals(result, 1)).toBe(true)
      expect(toNumber(result)).toBe(1)
    })

    it('should handle comparison after arithmetic', () => {
      const a = add('0.1', '0.2')
      const b = toDecimal('0.3')
      expect(equals(a, b)).toBe(true)
      expect(greaterThan(a, '0.2')).toBe(true)
      expect(greaterThan('0.2', a)).toBe(false)
    })

    it('should handle mixed positive and negative calculations', () => {
      const result = add(subtract('100', '50'), subtract('-20', '10'))
      expect(toNumber(result)).toBe(20) // (100-50) + (-20-10) = 50 + (-30) = 20
    })

    it('should correctly identify zero after operations', () => {
      const result = subtract(add('10.5', '5'), add('10', '5.5'))
      expect(isZero(result)).toBe(true)
    })

    it('should handle absolute values in calculations', () => {
      const difference = subtract('10', '15')
      const absoluteDifference = abs(difference)
      expect(toNumber(absoluteDifference)).toBe(5)
      expect(greaterThan(absoluteDifference, 0)).toBe(true)
    })
  })
})
