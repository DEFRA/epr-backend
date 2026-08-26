import { describe, it, expect } from 'vitest'

import { cancellationRefusal, isRegulatorCancellable } from './cancellation.js'
import { RelevantYearWindowExpiredError } from './relevant-year.js'
import { PRN_STATUS } from './model.js'

describe('cancellationRefusal', () => {
  it('is undefined for accepted -> cancelled within the window', () => {
    expect(
      cancellationRefusal(
        PRN_STATUS.ACCEPTED,
        PRN_STATUS.CANCELLED,
        2026,
        new Date('2027-01-31T23:59:59.999Z')
      )
    ).toBeUndefined()
  })

  it('refuses accepted -> cancelled once the deadline has passed', () => {
    expect(
      cancellationRefusal(
        PRN_STATUS.ACCEPTED,
        PRN_STATUS.CANCELLED,
        2026,
        new Date('2027-02-01T00:00:00.000Z')
      )
    ).toBeInstanceOf(RelevantYearWindowExpiredError)
  })

  it('carries the relevant year on the refusal', () => {
    const refusal = cancellationRefusal(
      PRN_STATUS.ACCEPTED,
      PRN_STATUS.CANCELLED,
      2026,
      new Date('2027-03-01T00:00:00.000Z')
    )

    expect(refusal).toBeInstanceOf(RelevantYearWindowExpiredError)
    expect(refusal?.relevantYear).toBe(2026)
  })

  it.each([
    [
      'awaiting_cancellation -> cancelled (signatory path, no deadline)',
      PRN_STATUS.AWAITING_CANCELLATION,
      PRN_STATUS.CANCELLED
    ],
    [
      'awaiting_authorisation -> deleted',
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_STATUS.DELETED
    ],
    ['draft -> discarded', PRN_STATUS.DRAFT, PRN_STATUS.DISCARDED]
  ])(
    'has no view on %s, even long past what would be the deadline',
    (_label, previousStatus, newStatus) => {
      expect(
        cancellationRefusal(
          previousStatus,
          newStatus,
          2000,
          new Date('2099-01-01T00:00:00.000Z')
        )
      ).toBeUndefined()
    }
  )

  describe('awaiting_acceptance -> cancelled (admin path, PAE-1859)', () => {
    it('is undefined within the window', () => {
      expect(
        cancellationRefusal(
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_STATUS.CANCELLED,
          2026,
          new Date('2027-01-31T23:59:59.999Z')
        )
      ).toBeUndefined()
    })

    it('refuses once the deadline has passed', () => {
      expect(
        cancellationRefusal(
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_STATUS.CANCELLED,
          2026,
          new Date('2027-02-01T00:00:00.000Z')
        )
      ).toBeInstanceOf(RelevantYearWindowExpiredError)
    })
  })
})

describe('isRegulatorCancellable', () => {
  it.each([PRN_STATUS.ACCEPTED, PRN_STATUS.AWAITING_ACCEPTANCE])(
    'is true for %s within the window',
    (status) => {
      expect(
        isRegulatorCancellable(
          status,
          2026,
          new Date('2027-01-31T23:59:59.999Z')
        )
      ).toBe(true)
    }
  )

  it.each([PRN_STATUS.ACCEPTED, PRN_STATUS.AWAITING_ACCEPTANCE])(
    'is false for %s once the deadline has passed',
    (status) => {
      expect(
        isRegulatorCancellable(
          status,
          2026,
          new Date('2027-02-01T00:00:00.000Z')
        )
      ).toBe(false)
    }
  )

  it.each([
    PRN_STATUS.DRAFT,
    PRN_STATUS.AWAITING_AUTHORISATION,
    PRN_STATUS.AWAITING_CANCELLATION,
    PRN_STATUS.CANCELLED,
    PRN_STATUS.DELETED,
    PRN_STATUS.DISCARDED
  ])('is false for %s regardless of the deadline', (status) => {
    expect(
      isRegulatorCancellable(status, 2000, new Date('2099-01-01T00:00:00.000Z'))
    ).toBe(false)
  })
})
