import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SUMMARY_LOG_STATUS } from './status.js'
import { calculateExpiresAt } from './expiry.js'

describe('calculateExpiresAt', () => {
  const FIXED_NOW = new Date('2024-12-19T12:00:00.000Z')

  const MILLISECONDS_PER_MINUTE = 60_000
  const MILLISECONDS_PER_DAY = 86_400_000
  const MILLISECONDS_PER_WEEK = 604_800_000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('24-hour TTL statuses', () => {
    const oneDayStatuses = [
      SUMMARY_LOG_STATUS.PREPROCESSING,
      SUMMARY_LOG_STATUS.VALIDATING,
      SUMMARY_LOG_STATUS.SUPERSEDED,
      SUMMARY_LOG_STATUS.REJECTED,
      SUMMARY_LOG_STATUS.VALIDATION_FAILED
    ]

    it.each(oneDayStatuses)(
      'returns expiry 1 day from now for %s status',
      (status) => {
        const result = calculateExpiresAt(status)
        const expected = new Date(FIXED_NOW.getTime() + MILLISECONDS_PER_DAY)
        expect(result).toEqual(expected)
      }
    )
  })

  describe('7-day TTL statuses', () => {
    const oneWeekStatuses = [
      SUMMARY_LOG_STATUS.VALIDATED,
      SUMMARY_LOG_STATUS.INVALID
    ]

    it.each(oneWeekStatuses)(
      'returns expiry 1 week from now for %s status',
      (status) => {
        const result = calculateExpiresAt(status)
        const expected = new Date(FIXED_NOW.getTime() + MILLISECONDS_PER_WEEK)
        expect(result).toEqual(expected)
      }
    )
  })

  describe('20-minute TTL statuses', () => {
    it('returns expiry 20 minutes from now for submitting status', () => {
      const result = calculateExpiresAt(SUMMARY_LOG_STATUS.SUBMITTING)
      const expected = new Date(
        FIXED_NOW.getTime() + 20 * MILLISECONDS_PER_MINUTE
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
