import { describe, expect, it } from 'vitest'
import { MESSAGES, YES_NO_VALUES } from './joi-messages.js'

describe('joi-messages', () => {
  describe('MESSAGES', () => {
    it('exports message constants', () => {
      expect(MESSAGES.MUST_BE_A_NUMBER).toBe('must be a number')
      expect(MESSAGES.MUST_BE_A_STRING).toBe('must be a string')
      expect(MESSAGES.MUST_BE_A_VALID_DATE).toBe('must be a valid date')
      expect(MESSAGES.MUST_BE_GREATER_THAN_ZERO).toBe('must be greater than 0')
      expect(MESSAGES.MUST_BE_AT_LEAST_ZERO).toBe('must be at least 0')
      expect(MESSAGES.MUST_BE_LESS_THAN_ONE).toBe('must be less than 1')
      expect(MESSAGES.MUST_BE_AT_MOST_1).toBe('must be at most 1')
      expect(MESSAGES.MUST_BE_AT_MOST_1000).toBe('must be at most 1000')
      expect(MESSAGES.MUST_BE_YES_OR_NO).toBe('must be Yes or No')
    })

    it('is frozen', () => {
      expect(Object.isFrozen(MESSAGES)).toBe(true)
    })
  })

  describe('YES_NO_VALUES', () => {
    it('exports YES value', () => {
      expect(YES_NO_VALUES.YES).toBe('Yes')
    })

    it('exports NO value', () => {
      expect(YES_NO_VALUES.NO).toBe('No')
    })

    it('is frozen', () => {
      expect(Object.isFrozen(YES_NO_VALUES)).toBe(true)
    })
  })
})
