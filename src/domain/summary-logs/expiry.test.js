import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SUMMARY_LOG_STATUS, calculateExpiresAt } from './status.js'

describe('calculateExpiresAt', () => {
  const FIXED_NOW = new Date('2024-12-19T12:00:00.000Z')
  const TWENTY_MINUTES_LATER = new Date('2024-12-19T12:20:00.000Z')
  const ONE_DAY_LATER = new Date('2024-12-20T12:00:00.000Z')
  const ONE_WEEK_LATER = new Date('2024-12-26T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('1-day TTL statuses', () => {
    const oneDayStatuses = [
      SUMMARY_LOG_STATUS.PREPROCESSING,
      SUMMARY_LOG_STATUS.VALIDATING,
      SUMMARY_LOG_STATUS.SUPERSEDED,
      SUMMARY_LOG_STATUS.REJECTED,
      SUMMARY_LOG_STATUS.VALIDATION_FAILED,
      SUMMARY_LOG_STATUS.SUBMISSION_FAILED
    ]

    it.each(oneDayStatuses)(
      'returns expiry 1 day from now for %s status',
      (status) => {
        const result = calculateExpiresAt(status)
        expect(result).toEqual(ONE_DAY_LATER)
      }
    )
  })

  describe('1-week TTL statuses', () => {
    const oneWeekStatuses = [
      SUMMARY_LOG_STATUS.VALIDATED,
      SUMMARY_LOG_STATUS.INVALID
    ]

    it.each(oneWeekStatuses)(
      'returns expiry 1 week from now for %s status',
      (status) => {
        const result = calculateExpiresAt(status)
        expect(result).toEqual(ONE_WEEK_LATER)
      }
    )
  })

  describe('20-minute TTL statuses', () => {
    it('returns expiry 20 minutes from now for submitting status', () => {
      const result = calculateExpiresAt(SUMMARY_LOG_STATUS.SUBMITTING)
      expect(result).toEqual(TWENTY_MINUTES_LATER)
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
