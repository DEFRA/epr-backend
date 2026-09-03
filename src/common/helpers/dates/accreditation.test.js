import { describe, expect, it } from 'vitest'
import {
  accreditationWindow,
  getStatusHistoryDateTimes,
  isSuspendedOrCancelledAtDate,
  isAccreditedAtDates,
  isWithinAccreditationDateRange
} from './accreditation.js'

/** @import {Accreditation, StatusHistoryEntry} from '#domain/organisations/accreditation.js' */
/** @import {AccreditationStatus} from '#domain/organisations/model.js' */
/** @import {AccreditationWindow, StatusHistoryDateTime} from './accreditation.js' */

/**
 * @param {Partial<Accreditation>} [overrides]
 * @returns {Accreditation}
 */
const buildAccreditation = (overrides = {}) =>
  /** @type {Accreditation} */ ({
    status: 'approved',
    validFrom: '2025-01-01',
    validTo: '2025-12-31',
    statusHistory: [],
    ...overrides
  })

describe('accreditation date helpers', () => {
  describe('accreditationWindow', () => {
    it.each(
      /** @type {AccreditationStatus[]} */ ([
        'approved',
        'suspended',
        'cancelled'
      ])
    )(
      'builds a window for a %s accreditation carrying both dates',
      (status) => {
        expect(accreditationWindow(buildAccreditation({ status }))).toEqual({
          validFrom: '2025-01-01',
          validTo: '2025-12-31'
        })
      }
    )

    it('builds a window for a cancelled accreditation, which keeps the window it held while live', () => {
      expect(
        accreditationWindow(buildAccreditation({ status: 'cancelled' }))
      ).not.toBeNull()
    })

    it.each([
      { validFrom: undefined, validTo: undefined, desc: 'neither date' },
      { validFrom: '2025-01-01', validTo: undefined, desc: 'no validTo' },
      { validFrom: undefined, validTo: '2025-12-31', desc: 'no validFrom' }
    ])(
      'returns null for an accreditation with $desc, which has never had a window',
      ({ validFrom, validTo }) => {
        expect(
          accreditationWindow(
            buildAccreditation({ status: 'created', validFrom, validTo })
          )
        ).toBeNull()
      }
    )
  })

  describe('isWithinAccreditationDateRange', () => {
    const window = /** @type {AccreditationWindow} */ (
      accreditationWindow(buildAccreditation())
    )

    it.each([
      { date: '2025-06-15', expected: true, desc: 'within range' },
      { date: '2024-12-31', expected: false, desc: 'before range' },
      { date: '2025-01-01', expected: true, desc: 'on validFrom boundary' },
      { date: '2025-12-31', expected: true, desc: 'on validTo boundary' },
      { date: '2026-01-01', expected: false, desc: 'after range' }
    ])('should return $expected when date is $desc', ({ date, expected }) => {
      expect(isWithinAccreditationDateRange(date, window)).toBe(expected)
    })

    // The bounds are bare dates, so an instant later in the day sorts after the
    // bound it shares a day with. Only ever bites on the last day of a window.
    it.each([
      { date: '2025-12-31T23:59:59.999Z', desc: 'an ISO datetime' },
      { date: new Date('2025-12-31T23:59:59.999Z'), desc: 'a Date' }
    ])(
      'should include the last day of the window when given $desc late in it',
      ({ date }) => {
        expect(isWithinAccreditationDateRange(date, window)).toBe(true)
      }
    )
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

  describe('isSuspendedOrCancelledAtDate', () => {
    it('should return false when statusHistory is empty', () => {
      expect(isSuspendedOrCancelledAtDate('2025-06-15T00:00:00.000Z', [])).toBe(
        false
      )
    })

    it('should return false when most recent status is approved', () => {
      /** @type {StatusHistoryDateTime[]} */
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
        isSuspendedOrCancelledAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return true when accreditation was suspended at the given date', () => {
      /** @type {StatusHistoryDateTime[]} */
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
        isSuspendedOrCancelledAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return false when accreditation was re-approved after suspension', () => {
      /** @type {StatusHistoryDateTime[]} */
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
        isSuspendedOrCancelledAtDate('2025-08-01T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return true when date falls within a suspension period before re-approval', () => {
      /** @type {StatusHistoryDateTime[]} */
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
        isSuspendedOrCancelledAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return false when date is before any status history entries', () => {
      /** @type {StatusHistoryDateTime[]} */
      const statusHistory = [
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isSuspendedOrCancelledAtDate('2025-01-01T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return true on the exact date of suspension', () => {
      /** @type {StatusHistoryDateTime[]} */
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
        isSuspendedOrCancelledAtDate('2025-06-01T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return false when most recent status is created', () => {
      /** @type {StatusHistoryDateTime[]} */
      const statusHistory = [
        {
          status: 'created',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isSuspendedOrCancelledAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })

    it('should return true with a single suspended entry', () => {
      /** @type {StatusHistoryDateTime[]} */
      const statusHistory = [
        {
          status: 'suspended',
          updatedAt: new Date('2025-01-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isSuspendedOrCancelledAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should use the first entry when multiple share the same timestamp', () => {
      /** @type {StatusHistoryDateTime[]} */
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
        isSuspendedOrCancelledAtDate('2025-06-15T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })
    it('should return true when the most recent status is cancelled', () => {
      /** @type {StatusHistoryDateTime[]} */
      const statusHistory = [
        {
          status: 'cancelled',
          updatedAt: new Date('2025-08-01T00:00:00.000Z').getTime()
        },
        {
          status: 'suspended',
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        },
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isSuspendedOrCancelledAtDate('2025-09-01T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return true on the exact date of cancellation', () => {
      /** @type {StatusHistoryDateTime[]} */
      const statusHistory = [
        {
          status: 'cancelled',
          updatedAt: new Date('2025-08-01T00:00:00.000Z').getTime()
        },
        {
          status: 'suspended',
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isSuspendedOrCancelledAtDate('2025-08-01T00:00:00.000Z', statusHistory)
      ).toBe(true)
    })

    it('should return false for a date before cancellation while still approved', () => {
      /** @type {StatusHistoryDateTime[]} */
      const statusHistory = [
        {
          status: 'cancelled',
          updatedAt: new Date('2025-08-01T00:00:00.000Z').getTime()
        },
        {
          status: 'suspended',
          updatedAt: new Date('2025-06-01T00:00:00.000Z').getTime()
        },
        {
          status: 'approved',
          updatedAt: new Date('2025-03-01T00:00:00.000Z').getTime()
        }
      ]

      expect(
        isSuspendedOrCancelledAtDate('2025-05-01T00:00:00.000Z', statusHistory)
      ).toBe(false)
    })
  })

  describe('isAccreditedAtDates', () => {
    const approvedStatusHistory = /** @type {StatusHistoryEntry[]} */ ([
      { status: 'created', updatedAt: '2024-12-01T00:00:00.000Z' },
      { status: 'approved', updatedAt: '2024-12-15T00:00:00.000Z' }
    ])

    const accreditation = buildAccreditation({
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

    it('should return false when accreditation has no date range', () => {
      expect(
        isAccreditedAtDates(['2025-06-15T00:00:00.000Z'], {
          ...accreditation,
          status: 'created',
          validFrom: undefined,
          validTo: undefined
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

    it('should return true when date is before approval in status history but within validFrom/validTo', () => {
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
      ).toBe(true)
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

    it('should include loads before approval date when within validFrom/validTo', () => {
      // Approved on 30th Jan, validFrom 1st Jan.
      // Loads between 1st-30th Jan must be included — approval is
      // determined by validFrom/validTo, not the status history date.
      const lateApprovalAccreditation = buildAccreditation({
        statusHistory: [
          /** @type {StatusHistoryEntry} */ ({
            status: 'created',
            updatedAt: '2024-11-15T00:00:00.000Z'
          }),
          /** @type {StatusHistoryEntry} */ ({
            status: 'approved',
            updatedAt: '2025-01-30T00:00:00.000Z'
          })
        ]
      })

      expect(
        isAccreditedAtDates(
          ['2025-01-10T00:00:00.000Z', '2025-01-20T00:00:00.000Z'],
          lateApprovalAccreditation
        )
      ).toBe(true)
    })

    const suspendedThenCancelled = [
      { status: 'created', updatedAt: '2024-12-01T00:00:00.000Z' },
      { status: 'approved', updatedAt: '2024-12-15T00:00:00.000Z' },
      { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' },
      { status: 'cancelled', updatedAt: '2025-08-01T00:00:00.000Z' }
    ]

    it('should return false for a date after cancellation (post-cancellation load not credited)', () => {
      const cancelledAccreditation = /** @type {Accreditation} */ ({
        ...accreditation,
        statusHistory: suspendedThenCancelled
      })

      expect(
        isAccreditedAtDates(
          ['2025-09-01T00:00:00.000Z'],
          cancelledAccreditation
        )
      ).toBe(false)
    })

    it('should return true for a date before cancellation within the approved period', () => {
      const cancelledAccreditation = /** @type {Accreditation} */ ({
        ...accreditation,
        statusHistory: suspendedThenCancelled
      })

      expect(
        isAccreditedAtDates(
          ['2025-05-01T00:00:00.000Z'],
          cancelledAccreditation
        )
      ).toBe(true)
    })
  })
})
