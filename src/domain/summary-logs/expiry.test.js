import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SUMMARY_LOG_STATUS } from './status.js'
import { calculateExpiresAt, TTL_DURATIONS } from './expiry.js'

describe('calculateExpiresAt', () => {
  const FIXED_NOW = new Date('2024-12-19T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('TTL durations', () => {
    it('exports TTL durations in milliseconds', () => {
      expect(TTL_DURATIONS.TWENTY_MINUTES).toBe(20 * 60 * 1000)
      expect(TTL_DURATIONS.TWENTY_FOUR_HOURS).toBe(24 * 60 * 60 * 1000)
      expect(TTL_DURATIONS.SEVEN_DAYS).toBe(7 * 24 * 60 * 60 * 1000)
    })
  })

  describe('24-hour TTL statuses', () => {
    const twentyFourHourStatuses = [
      SUMMARY_LOG_STATUS.PREPROCESSING,
      SUMMARY_LOG_STATUS.VALIDATING,
      SUMMARY_LOG_STATUS.SUPERSEDED,
      SUMMARY_LOG_STATUS.REJECTED,
      SUMMARY_LOG_STATUS.VALIDATION_FAILED
    ]

    it.each(twentyFourHourStatuses)(
      'returns expiry 24 hours from now for %s status',
      (status) => {
        const result = calculateExpiresAt(status)
        const expected = new Date(
          FIXED_NOW.getTime() + TTL_DURATIONS.TWENTY_FOUR_HOURS
        )
        expect(result).toEqual(expected)
      }
    )
  })

  describe('7-day TTL statuses', () => {
    const sevenDayStatuses = [
      SUMMARY_LOG_STATUS.VALIDATED,
      SUMMARY_LOG_STATUS.INVALID
    ]

    it.each(sevenDayStatuses)(
      'returns expiry 7 days from now for %s status',
      (status) => {
        const result = calculateExpiresAt(status)
        const expected = new Date(
          FIXED_NOW.getTime() + TTL_DURATIONS.SEVEN_DAYS
        )
        expect(result).toEqual(expected)
      }
    )
  })

  describe('20-minute TTL statuses', () => {
    it('returns expiry 20 minutes from now for submitting status', () => {
      const result = calculateExpiresAt(SUMMARY_LOG_STATUS.SUBMITTING)
      const expected = new Date(
        FIXED_NOW.getTime() + TTL_DURATIONS.TWENTY_MINUTES
      )
      expect(result).toEqual(expected)
    })
  })

  describe('no TTL statuses', () => {
    it('returns null for submitted status', () => {
      const result = calculateExpiresAt(SUMMARY_LOG_STATUS.SUBMITTED)
      expect(result).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('throws for unknown status', () => {
      expect(() => calculateExpiresAt('unknown-status')).toThrow(
        'Unknown status for TTL calculation: unknown-status'
      )
    })

    it('throws for null status', () => {
      expect(() => calculateExpiresAt(null)).toThrow(
        'Unknown status for TTL calculation: null'
      )
    })

    it('throws for undefined status', () => {
      expect(() => calculateExpiresAt(undefined)).toThrow(
        'Unknown status for TTL calculation: undefined'
      )
    })
  })
})
