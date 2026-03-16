import { describe, expect, it } from 'vitest'
import {
  isWithinAccreditationDateRange,
  isAccreditationApprovedAtDate,
  isAccreditedAtDates,
  getStatusHistoryDateTimes
} from './accreditation.js'
/** @import {Accreditation, StatusHistoryEntry} from '#repositories/organisations/port.js' */

describe('accreditation date helpers', () => {
  describe('isWithinAccreditationDateRange', () => {
    const accreditation = /** @type {Accreditation} */ ({
      validFrom: '2025-01-01T00:00:00.000Z',
      validTo: '2025-12-31T23:59:59.999Z'
    })

    it.each([
      {
        date: '2025-06-15T00:00:00.000Z',
        expected: true,
        desc: 'within range'
      },
      {
        date: '2024-12-31T00:00:00.000Z',
        expected: false,
        desc: 'before range'
      },
      {
        date: '2025-01-01T00:00:00.000Z',
        expected: true,
        desc: 'on validFrom boundary'
      },
      {
        date: '2025-12-31T23:59:59.999Z',
        expected: true,
        desc: 'on validTo boundary'
      },
      { date: '2026-01-01T00:00:00.000Z', expected: false, desc: 'after range' }
    ])('should return $expected when date is $desc', ({ date, expected }) => {
      expect(isWithinAccreditationDateRange(date, accreditation)).toBe(expected)
    })
  })

  describe('getStatusHistoryDateTimes', () => {
    it('should convert updatedAt strings to numeric timestamps', () => {
      const statusHistory = [
        /** @type {StatusHistoryEntry} */ ({
          status: 'created',
          updatedAt: '2025-01-01T00:00:00.000Z'
        })
      ]

      const result = getStatusHistoryDateTimes(statusHistory)

      expect(result).toEqual([
        {
          status: 'created',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ])
    })

    it('should sort entries in descending order by updatedAt', () => {
      const statusHistory = [
        /** @type {StatusHistoryEntry} */ ({
          status: 'created',
          updatedAt: '2025-01-01T00:00:00.000Z'
        }),
        /** @type {StatusHistoryEntry} */ ({
          status: 'approved',
          updatedAt: '2025-06-01T00:00:00.000Z'
        }),
        /** @type {StatusHistoryEntry} */ ({
          status: 'suspended',
          updatedAt: '2025-03-01T00:00:00.000Z'
        })
      ]

      const result = getStatusHistoryDateTimes(statusHistory)

      expect(result).toEqual([
        {
          status: 'approved',
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        },
        {
          status: 'suspended',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        },
        {
          status: 'created',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ])
    })

    it('should return an empty array when given an empty array', () => {
      expect(getStatusHistoryDateTimes([])).toEqual([])
    })
  })

  describe('isAccreditationApprovedAtDate', () => {
    it('should return false when statusHistory is empty', () => {
      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', [])
      ).toBe(false)
    })

    it('should return true when accreditation was approved at the given date', () => {
      const statusHistory = [
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        },
        {
          status: 'created',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return false when accreditation was suspended at the given date', () => {
      const statusHistory = [
        {
          status: 'suspended',
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        },
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        },
        {
          status: 'created',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return true when accreditation was re-approved after suspension', () => {
      const statusHistory = [
        {
          status: 'approved',
          updatedAt: new Date('2025-07-01T00:00:00.000Z').getTime()
        },
        {
          status: 'suspended',
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        },
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        },
        {
          status: 'created',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-08-01T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return false when date falls within a suspension period before re-approval', () => {
      const statusHistory = [
        {
          status: 'approved',
          updatedAt: new Date('2025-07-01T00:00:00.000Z').getTime()
        },
        {
          status: 'suspended',
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        },
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        },
        {
          status: 'created',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return false when date is before any status history entries', () => {
      const statusHistory = [
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-01-01T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return false on the exact date of suspension', () => {
      const statusHistory = [
        {
          status: 'suspended',
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        },
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        },
        {
          status: 'created',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-01T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return true on exact approval boundary', () => {
      const statusHistory = [
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        },
        {
          status: 'created',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-03-01T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return false with a single suspended entry', () => {
      const statusHistory = [
        {
          status: 'suspended',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it.each([
      { status: 'cancelled', desc: 'cancelled' },
      { status: 'revoked', desc: 'revoked' },
      { status: 'created', desc: 'created' }
    ])('should return false when most recent status is $desc', ({ status }) => {
      const statusHistory = [
        {
          status,
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        },
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should use the first entry when multiple share the same timestamp', () => {
      const statusHistory = [
        {
          status: 'suspended',
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        },
        {
          status: 'approved',
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        },
        {
          status: 'created',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isAccreditationApprovedAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })
  })

  describe('isAccreditedAtDates', () => {
    const approvedStatusHistory = [
      { status: 'created', updatedAt: '2024-12-01T00:00:00.000Z' },
      { status: 'approved', updatedAt: '2024-12-15T00:00:00.000Z' }
    ]

    const accreditation = /** @type {Accreditation} */ ({
      validFrom: '2025-01-01T00:00:00.000Z',
      validTo: '2025-12-31T23:59:59.999Z',
      statusHistory: approvedStatusHistory
    })

    it('should return true when all dates are within range and approved', () => {
      expect(
        isAccreditedAtDates(
          ['2025-03-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z'],
          accreditation
        )
      ).toBe(true)
    })

    it('should return true when accreditation is undefined', () => {
      expect(isAccreditedAtDates(['2025-06-15T00:00:00.000Z'], undefined)).toBe(
        true
      )
    })

    it('should return true when accreditation is null', () => {
      expect(isAccreditedAtDates(['2025-06-15T00:00:00.000Z'], null)).toBe(true)
    })

    it('should return false when statusHistory is undefined', () => {
      expect(
        isAccreditedAtDates(['2025-06-15T00:00:00.000Z'], {
          ...accreditation,
          statusHistory: undefined
        })
      ).toBe(false)
    })

    it('should return false when statusHistory is null', () => {
      expect(
        isAccreditedAtDates(['2025-06-15T00:00:00.000Z'], {
          ...accreditation,
          statusHistory: null
        })
      ).toBe(false)
    })

    it('should return false when a date is outside the accreditation range', () => {
      expect(
        isAccreditedAtDates(
          ['2025-06-15T00:00:00.000Z', '2026-06-01T00:00:00.000Z'],
          accreditation
        )
      ).toBe(false)
    })

    it('should return false when a date falls during a suspension period', () => {
      const accreditationWithSuspension = /** @type {Accreditation} */ ({
        ...accreditation,
        statusHistory: [
          { status: 'created', updatedAt: '2024-12-01T00:00:00.000Z' },
          { status: 'approved', updatedAt: '2024-12-15T00:00:00.000Z' },
          { status: 'suspended', updatedAt: '2025-04-01T00:00:00.000Z' }
        ]
      })

      expect(
        isAccreditedAtDates(
          ['2025-03-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z'],
          accreditationWithSuspension
        )
      ).toBe(false)
    })

    it('should return true for an empty dates array', () => {
      expect(isAccreditedAtDates([], accreditation)).toBe(true)
    })

    it('should return true when date is on validFrom boundary and approved', () => {
      expect(
        isAccreditedAtDates(['2025-01-01T00:00:00.000Z'], accreditation)
      ).toBe(true)
    })

    it('should return true when date is on validTo boundary and approved', () => {
      expect(
        isAccreditedAtDates(['2025-12-31T23:59:59.999Z'], accreditation)
      ).toBe(true)
    })

    it('should return false when accreditation was not yet approved at the date', () => {
      const accreditationLateApproval = /** @type {Accreditation} */ ({
        ...accreditation,
        statusHistory: [
          /** @type {StatusHistoryEntry} */ ({
            status: 'created',
            updatedAt: '2025-06-01T00:00:00.000Z'
          }),
          /** @type {StatusHistoryEntry} */ ({
            status: 'approved',
            updatedAt: '2025-09-01T00:00:00.000Z'
          })
        ]
      })

      expect(
        isAccreditedAtDates(
          ['2025-07-01T00:00:00.000Z'],
          accreditationLateApproval
        )
      ).toBe(false)
    })

    it('should handle out-of-order statusHistory entries', () => {
      const accreditationUnordered = /** @type {Accreditation} */ ({
        ...accreditation,
        statusHistory: [
          /** @type {StatusHistoryEntry} */ ({
            status: 'approved',
            updatedAt: '2024-12-15T00:00:00.000Z'
          }),
          /** @type {StatusHistoryEntry} */ ({
            status: 'created',
            updatedAt: '2024-12-01T00:00:00.000Z'
          })
        ]
      })

      expect(
        isAccreditedAtDates(
          ['2025-06-15T00:00:00.000Z'],
          accreditationUnordered
        )
      ).toBe(true)
    })

    it('should return false when approved then suspended then checking date in suspension', () => {
      const accreditationWithGap = /** @type {Accreditation} */ ({
        ...accreditation,
        statusHistory: [
          /** @type {StatusHistoryEntry} */ ({
            status: 'created',
            updatedAt: '2024-12-01T00:00:00.000Z'
          }),
          /** @type {StatusHistoryEntry} */ ({
            status: 'approved',
            updatedAt: '2024-12-15T00:00:00.000Z'
          }),
          /** @type {StatusHistoryEntry} */ ({
            status: 'suspended',
            updatedAt: '2025-04-01T00:00:00.000Z'
          }),
          /** @type {StatusHistoryEntry} */ ({
            status: 'approved',
            updatedAt: '2025-08-01T00:00:00.000Z'
          })
        ]
      })

      // One date in approved period, one in suspension period
      expect(
        isAccreditedAtDates(
          ['2025-03-01T00:00:00.000Z', '2025-05-01T00:00:00.000Z'],
          accreditationWithGap
        )
      ).toBe(false)
    })
  })
})
