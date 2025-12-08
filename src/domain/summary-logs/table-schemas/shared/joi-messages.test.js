import { describe, expect, it } from 'vitest'
import {
  MESSAGES,
  PATTERNS,
  CONSTANTS,
  ROW_ID_MINIMUMS
} from './joi-messages.js'

describe('joi-messages', () => {
  describe('MESSAGES', () => {
    it('exports message constants', () => {
      expect(MESSAGES.MUST_BE_A_NUMBER).toBe('must be a number')
      expect(MESSAGES.MUST_BE_A_STRING).toBe('must be a string')
      expect(MESSAGES.MUST_BE_A_VALID_DATE).toBe('must be a valid date')
      expect(MESSAGES.MUST_BE_GREATER_THAN_ZERO).toBe('must be greater than 0')
      expect(MESSAGES.MUST_BE_LESS_THAN_ONE).toBe('must be less than 1')
      expect(MESSAGES.MUST_BE_AT_MOST_1000).toBe('must be at most 1000')
    })

    it('is frozen', () => {
      expect(Object.isFrozen(MESSAGES)).toBe(true)
    })
  })

  describe('PATTERNS', () => {
    it('exports EWC_CODE pattern', () => {
      expect(PATTERNS.EWC_CODE).toBeInstanceOf(RegExp)
    })

    it('EWC_CODE matches valid format', () => {
      expect(PATTERNS.EWC_CODE.test('03 03 08')).toBe(true)
      expect(PATTERNS.EWC_CODE.test('15 01 02')).toBe(true)
    })

    it('EWC_CODE matches valid format with optional star', () => {
      expect(PATTERNS.EWC_CODE.test('03 03 08*')).toBe(true)
      expect(PATTERNS.EWC_CODE.test('15 01 02*')).toBe(true)
    })

    it('EWC_CODE rejects invalid format', () => {
      expect(PATTERNS.EWC_CODE.test('030308')).toBe(false)
      expect(PATTERNS.EWC_CODE.test('03-03-08')).toBe(false)
      expect(PATTERNS.EWC_CODE.test('3 3 8')).toBe(false)
      expect(PATTERNS.EWC_CODE.test('03 03 08**')).toBe(false)
      expect(PATTERNS.EWC_CODE.test('*03 03 08')).toBe(false)
    })

    it('is frozen', () => {
      expect(Object.isFrozen(PATTERNS)).toBe(true)
    })
  })

  describe('CONSTANTS', () => {
    it('exports ZERO', () => {
      expect(CONSTANTS.ZERO).toBe(0)
    })

    it('exports MAX_PRODUCT_TONNAGE', () => {
      expect(CONSTANTS.MAX_PRODUCT_TONNAGE).toBe(1000)
    })

    it('is frozen', () => {
      expect(Object.isFrozen(CONSTANTS)).toBe(true)
    })
  })

  describe('ROW_ID_MINIMUMS', () => {
    it('exports per-table ROW_ID minimums', () => {
      expect(ROW_ID_MINIMUMS.RECEIVED_LOADS_FOR_REPROCESSING).toBe(1000)
      expect(ROW_ID_MINIMUMS.REPROCESSED_LOADS).toBe(3000)
    })

    it('is frozen', () => {
      expect(Object.isFrozen(ROW_ID_MINIMUMS)).toBe(true)
    })
  })
})
