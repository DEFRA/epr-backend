import { describe, it, expect } from 'vitest'

import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'
import {
  closingForSummaryLogSubmitted,
  closingForPrn
} from './ledger-closing-balance.js'

describe('closingForSummaryLogSubmitted', () => {
  it('shifts both balances by a positive delta', () => {
    expect(
      closingForSummaryLogSubmitted(
        { amount: 1000, availableAmount: 800 },
        1500,
        1000
      )
    ).toEqual({ amount: 1500, availableAmount: 1300 })
  })

  it('shifts both balances by a negative delta', () => {
    expect(
      closingForSummaryLogSubmitted(
        { amount: 1000, availableAmount: 800 },
        600,
        1000
      )
    ).toEqual({ amount: 600, availableAmount: 400 })
  })

  it('leaves both balances unchanged on a zero delta', () => {
    expect(
      closingForSummaryLogSubmitted(
        { amount: 1000, availableAmount: 800 },
        1000,
        1000
      )
    ).toEqual({ amount: 1000, availableAmount: 800 })
  })

  it('computes the delta without binary floating-point drift', () => {
    expect(
      closingForSummaryLogSubmitted({ amount: 0, availableAmount: 0 }, 0.3, 0.1)
    ).toEqual({ amount: 0.2, availableAmount: 0.2 })
  })

  describe('the December portion', () => {
    it('materialises a December portion when the opening has none and December moves', () => {
      expect(
        closingForSummaryLogSubmitted(
          { amount: 0, availableAmount: 0 },
          1000,
          0,
          250,
          0
        )
      ).toEqual({
        amount: 1000,
        availableAmount: 1000,
        decemberAmount: 250,
        decemberAvailableAmount: 250
      })
    })

    it('carries an existing December portion unchanged when December does not move', () => {
      expect(
        closingForSummaryLogSubmitted(
          {
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 250,
            decemberAvailableAmount: 250
          },
          1200,
          1000,
          250,
          250
        )
      ).toEqual({
        amount: 1200,
        availableAmount: 1200,
        decemberAmount: 250,
        decemberAvailableAmount: 250
      })
    })

    it('self-corrects the December portion to zero when tonnage is moved out of December', () => {
      expect(
        closingForSummaryLogSubmitted(
          {
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 250,
            decemberAvailableAmount: 250
          },
          1000,
          1000,
          0,
          250
        )
      ).toEqual({
        amount: 1000,
        availableAmount: 1000,
        decemberAmount: 0,
        decemberAvailableAmount: 0
      })
    })

    it('leaves no December fields when the opening has none and December does not move', () => {
      const closing = closingForSummaryLogSubmitted(
        { amount: 1000, availableAmount: 1000 },
        1200,
        1000
      )
      expect(closing).toEqual({ amount: 1200, availableAmount: 1200 })
      expect(closing).not.toHaveProperty('decemberAmount')
    })
  })
})

describe('closingForPrn', () => {
  const opening = { amount: 1000, availableAmount: 800 }

  it('ringfences available balance on creation, leaving total unchanged', () => {
    expect(closingForPrn(opening, LEDGER_EVENT_KIND.PRN_CREATED, 200)).toEqual({
      amount: 1000,
      availableAmount: 600
    })
  })

  it('deducts total balance on issue, leaving available unchanged', () => {
    expect(closingForPrn(opening, LEDGER_EVENT_KIND.PRN_ISSUED, 200)).toEqual({
      amount: 800,
      availableAmount: 800
    })
  })

  it('returns ringfenced tonnage to available on creation cancellation', () => {
    expect(
      closingForPrn(opening, LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED, 200)
    ).toEqual({ amount: 1000, availableAmount: 1000 })
  })

  it('returns tonnage to both balances when an issued PRN is cancelled', () => {
    expect(
      closingForPrn(opening, LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE, 200)
    ).toEqual({ amount: 1200, availableAmount: 1000 })
  })

  it('leaves the balance unchanged when a PRN is accepted', () => {
    expect(closingForPrn(opening, LEDGER_EVENT_KIND.PRN_ACCEPTED, 200)).toEqual(
      opening
    )
  })

  it('leaves the balance unchanged when a PRN is rejected', () => {
    expect(closingForPrn(opening, LEDGER_EVENT_KIND.PRN_REJECTED, 200)).toEqual(
      opening
    )
  })

  it('throws on an unrecognised event kind', () => {
    expect(() =>
      closingForPrn(opening, LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED, 200)
    ).toThrow('Unknown PRN event kind: summary-log-submitted')
  })

  describe('carrying the December portion through', () => {
    // A December portion the opening holds must survive every PRN event: a PRN
    // moves the general balance but never the December amounts, so the latest
    // event's closing balance still surfaces the portion (including after a
    // cancellation).
    const openingWithDecember = {
      amount: 1000,
      availableAmount: 800,
      decemberAmount: 250,
      decemberAvailableAmount: 200
    }

    it.each([
      {
        kind: LEDGER_EVENT_KIND.PRN_CREATED,
        expected: { amount: 1000, availableAmount: 600 }
      },
      {
        kind: LEDGER_EVENT_KIND.PRN_ISSUED,
        expected: { amount: 800, availableAmount: 800 }
      },
      {
        kind: LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED,
        expected: { amount: 1000, availableAmount: 1000 }
      },
      {
        kind: LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
        expected: { amount: 1200, availableAmount: 1000 }
      },
      {
        kind: LEDGER_EVENT_KIND.PRN_ACCEPTED,
        expected: { amount: 1000, availableAmount: 800 }
      },
      {
        kind: LEDGER_EVENT_KIND.PRN_REJECTED,
        expected: { amount: 1000, availableAmount: 800 }
      }
    ])(
      'preserves both December amounts on a $kind event',
      ({ kind, expected }) => {
        expect(closingForPrn(openingWithDecember, kind, 200)).toEqual({
          ...expected,
          decemberAmount: 250,
          decemberAvailableAmount: 200
        })
      }
    )
  })

  describe('debiting the December portion for a December PRN', () => {
    // A December PRN draws from the December pool: its debit moves the December
    // field alongside the total, so the general portion (total minus December)
    // is left whole.
    const openingWithDecember = {
      amount: 1000,
      availableAmount: 800,
      decemberAmount: 250,
      decemberAvailableAmount: 200
    }

    it('ringfences both the December available and the general available on creation', () => {
      expect(
        closingForPrn(
          openingWithDecember,
          LEDGER_EVENT_KIND.PRN_CREATED,
          50,
          true
        )
      ).toEqual({
        amount: 1000,
        availableAmount: 750,
        decemberAmount: 250,
        decemberAvailableAmount: 150
      })
    })

    it('deducts both the December total and the general total on issue', () => {
      expect(
        closingForPrn(
          openingWithDecember,
          LEDGER_EVENT_KIND.PRN_ISSUED,
          50,
          true
        )
      ).toEqual({
        amount: 950,
        availableAmount: 800,
        decemberAmount: 200,
        decemberAvailableAmount: 200
      })
    })
  })
})
