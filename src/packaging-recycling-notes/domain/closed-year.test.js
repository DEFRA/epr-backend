import { toYear } from '#common/helpers/dates/year.js'
import { describe, it, expect } from 'vitest'

import {
  closedYearConflict,
  closedYearConflictFor,
  closedYearRefusal,
  isRegulatorCancellable,
  isRelevantYearOpen
} from './closed-year.js'
import { PRN_STATUS } from './model.js'
import { RelevantYearWindowExpiredError } from './relevant-year.js'

const LAST_INSTANT = new Date('2027-01-31T23:59:59.999Z')
const CLOSED = new Date('2027-02-01T00:00:00.000Z')

describe('closed year', () => {
  describe('closedYearRefusal', () => {
    const closingWrites = [
      { description: 'creating', newStatus: PRN_STATUS.DRAFT },
      {
        description: 'raising',
        fromStatus: PRN_STATUS.DRAFT,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION
      },
      {
        description: 'issuing',
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE
      },
      {
        description: 'cancelling an accepted note',
        fromStatus: PRN_STATUS.ACCEPTED,
        newStatus: PRN_STATUS.CANCELLED
      },
      {
        description: 'cancelling a note awaiting acceptance',
        fromStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        newStatus: PRN_STATUS.CANCELLED
      }
    ]

    it.for(closingWrites)(
      'should allow $description on the last instant of 31 January after the year',
      (write) => {
        expect(
          closedYearRefusal({
            ...write,
            accreditationYear: toYear(2026),
            now: LAST_INSTANT
          })
        ).toBeUndefined()
      }
    )

    it.for(closingWrites)(
      'should refuse $description once the year has closed',
      (write) => {
        const refusal = closedYearRefusal({
          ...write,
          accreditationYear: toYear(2026),
          now: CLOSED
        })

        expect(refusal).toBeInstanceOf(RelevantYearWindowExpiredError)
        expect(refusal?.relevantYear).toBe(2026)
      }
    )

    it.for([
      {
        description: 'discarding a draft',
        fromStatus: PRN_STATUS.DRAFT,
        newStatus: PRN_STATUS.DISCARDED
      },
      {
        description: 'deleting an unissued note',
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        newStatus: PRN_STATUS.DELETED
      },
      {
        description: 'confirming a requested cancellation',
        fromStatus: PRN_STATUS.AWAITING_CANCELLATION,
        newStatus: PRN_STATUS.CANCELLED
      },
      {
        description: 'the producer accepting',
        fromStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        newStatus: PRN_STATUS.ACCEPTED
      },
      {
        description: 'a move to awaiting authorisation it does not name',
        fromStatus: PRN_STATUS.AWAITING_CANCELLATION,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION
      },
      {
        description: 'a move to awaiting acceptance it does not name',
        fromStatus: PRN_STATUS.ACCEPTED,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE
      }
    ])('should leave $description open after the year has closed', (write) => {
      expect(
        closedYearRefusal({
          ...write,
          accreditationYear: toYear(2000),
          now: new Date('2099-01-01T00:00:00.000Z')
        })
      ).toBeUndefined()
    })
  })

  describe('isRelevantYearOpen', () => {
    it.for([
      { now: LAST_INSTANT, open: true },
      { now: CLOSED, open: false }
    ])('should be $open at $now', ({ now, open }) => {
      expect(isRelevantYearOpen(toYear(2026), now)).toBe(open)
    })
  })

  describe('isRegulatorCancellable', () => {
    it.for([PRN_STATUS.ACCEPTED, PRN_STATUS.AWAITING_ACCEPTANCE])(
      'should be true for %s within the window',
      (status) => {
        expect(isRegulatorCancellable(status, toYear(2026), LAST_INSTANT)).toBe(
          true
        )
      }
    )

    it.for([PRN_STATUS.ACCEPTED, PRN_STATUS.AWAITING_ACCEPTANCE])(
      'should be false for %s once the year has closed',
      (status) => {
        expect(isRegulatorCancellable(status, toYear(2026), CLOSED)).toBe(false)
      }
    )

    it.for([
      PRN_STATUS.DRAFT,
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_STATUS.AWAITING_CANCELLATION,
      PRN_STATUS.CANCELLED,
      PRN_STATUS.DELETED,
      PRN_STATUS.DISCARDED
    ])('should be false for %s regardless of the year', (status) => {
      expect(
        isRegulatorCancellable(
          status,
          toYear(2000),
          new Date('2099-01-01T00:00:00.000Z')
        )
      ).toBe(false)
    })
  })

  describe('closedYearConflict', () => {
    it('should be a 409 carrying the closed-year code', () => {
      const conflict = closedYearConflict(
        new RelevantYearWindowExpiredError(toYear(2026)),
        'accreditationId=acc-1'
      )

      expect(conflict.output.statusCode).toBe(409)
      expect(conflict.output.payload).toMatchObject({
        code: 'RELEVANT_YEAR_CLOSED',
        message: 'The deadline for a 2026 relevant year was 31 January 2027.'
      })
    })
  })

  describe('closedYearConflictFor', () => {
    it('should give the 409 for a closed-year refusal', () => {
      const conflict = closedYearConflictFor(
        new RelevantYearWindowExpiredError(toYear(2026))
      )

      expect(conflict?.output.payload.code).toBe('RELEVANT_YEAR_CLOSED')
    })

    it('should name what was refused in the log reason', () => {
      const conflict = closedYearConflictFor(
        new RelevantYearWindowExpiredError(toYear(2026)),
        'prnId=prn-1'
      )

      expect(conflict?.event?.reason).toBe(
        'prnId=prn-1 rejected=RELEVANT_YEAR_CLOSED'
      )
    })

    it('should give nothing for any other error', () => {
      expect(closedYearConflictFor(new Error('elsewhere'))).toBeUndefined()
    })
  })
})
