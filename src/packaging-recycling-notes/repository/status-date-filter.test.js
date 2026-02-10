import { describe, it, expect } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  currentStatusDate,
  matchesStatusDateRange
} from './status-date-filter.js'

function buildMinimalPrn(currentStatus, historyEntries) {
  return {
    status: {
      currentStatus,
      history: historyEntries
    }
  }
}

describe('status-date-filter', () => {
  describe('currentStatusDate', () => {
    it('returns the date of the history entry matching the current status', () => {
      const issuedAt = new Date('2026-03-15T10:00:00Z')
      const prn = buildMinimalPrn(PRN_STATUS.AWAITING_ACCEPTANCE, [
        {
          status: PRN_STATUS.DRAFT,
          at: new Date('2026-03-14T10:00:00Z'),
          by: { id: 'u', name: 'U' }
        },
        {
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          at: issuedAt,
          by: { id: 'u', name: 'U' }
        }
      ])

      expect(currentStatusDate(prn)).toEqual(issuedAt)
    })

    it('returns the last matching entry when status appears multiple times in history', () => {
      const laterDate = new Date('2026-03-20T10:00:00Z')
      const prn = buildMinimalPrn(PRN_STATUS.AWAITING_ACCEPTANCE, [
        {
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          at: new Date('2026-03-10T10:00:00Z'),
          by: { id: 'u', name: 'U' }
        },
        {
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          at: laterDate,
          by: { id: 'u', name: 'U' }
        }
      ])

      expect(currentStatusDate(prn)).toEqual(laterDate)
    })

    it('returns null when no history entry matches the current status', () => {
      const prn = buildMinimalPrn(PRN_STATUS.CANCELLED, [
        {
          status: PRN_STATUS.DRAFT,
          at: new Date('2026-03-14T10:00:00Z'),
          by: { id: 'u', name: 'U' }
        }
      ])

      expect(currentStatusDate(prn)).toBeNull()
    })
  })

  describe('matchesStatusDateRange', () => {
    const issuedAt = new Date('2026-03-15T10:00:00Z')
    const prn = buildMinimalPrn(PRN_STATUS.AWAITING_ACCEPTANCE, [
      {
        status: PRN_STATUS.AWAITING_ACCEPTANCE,
        at: issuedAt,
        by: { id: 'u', name: 'U' }
      }
    ])

    it('returns true when date is within dateFrom and dateTo range', () => {
      expect(
        matchesStatusDateRange(
          prn,
          new Date('2026-03-15T09:00:00Z'),
          new Date('2026-03-15T11:00:00Z')
        )
      ).toBe(true)
    })

    it('returns true when date exactly equals dateFrom', () => {
      expect(matchesStatusDateRange(prn, issuedAt, undefined)).toBe(true)
    })

    it('returns true when date exactly equals dateTo', () => {
      expect(matchesStatusDateRange(prn, undefined, issuedAt)).toBe(true)
    })

    it('returns false when date is before dateFrom', () => {
      expect(
        matchesStatusDateRange(prn, new Date('2026-03-15T11:00:00Z'), undefined)
      ).toBe(false)
    })

    it('returns false when date is after dateTo', () => {
      expect(
        matchesStatusDateRange(prn, undefined, new Date('2026-03-15T09:00:00Z'))
      ).toBe(false)
    })

    it('returns true when no dateFrom or dateTo provided', () => {
      expect(matchesStatusDateRange(prn, undefined, undefined)).toBe(true)
    })

    it('returns false when no history entry matches the current status', () => {
      const noMatch = buildMinimalPrn(PRN_STATUS.CANCELLED, [
        {
          status: PRN_STATUS.DRAFT,
          at: new Date('2026-03-14T10:00:00Z'),
          by: { id: 'u', name: 'U' }
        }
      ])

      expect(
        matchesStatusDateRange(
          noMatch,
          new Date('2026-03-01T00:00:00Z'),
          undefined
        )
      ).toBe(false)
    })
  })
})
