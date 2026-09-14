import { describe, it, expect } from 'vitest'

import { LEDGER_EVENT_KIND, POOL } from '../repository/ledger-schema.js'
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

  describe('debiting the December pool for a December PRN', () => {
    // A December PRN moves its pool by the same delta it applies to the total:
    // creation ringfences decemberAvailableAmount alongside availableAmount;
    // issue deducts decemberAmount alongside amount. The untouched dimension of
    // each pool is carried through unchanged.
    const openingWithDecember = {
      amount: 1000,
      availableAmount: 800,
      decemberAmount: 300,
      decemberAvailableAmount: 250
    }

    it('ringfences the December available amount alongside the total on creation', () => {
      expect(
        closingForPrn(
          openingWithDecember,
          LEDGER_EVENT_KIND.PRN_CREATED,
          100,
          POOL.DECEMBER
        )
      ).toEqual({
        amount: 1000,
        availableAmount: 700,
        decemberAmount: 300,
        decemberAvailableAmount: 150
      })
    })

    it('deducts the December amount alongside the total on issue', () => {
      expect(
        closingForPrn(
          openingWithDecember,
          LEDGER_EVENT_KIND.PRN_ISSUED,
          100,
          POOL.DECEMBER
        )
      ).toEqual({
        amount: 900,
        availableAmount: 800,
        decemberAmount: 200,
        decemberAvailableAmount: 250
      })
    })

    // The decider only routes to the December pool once the opening carries a
    // December portion, so reaching here without one is a broken invariant.
    // It fails loud rather than silently materialising a negative December pool.
    it('throws on creation when the December pool is drawn but the opening carries no December portion', () => {
      expect(() =>
        closingForPrn(
          { amount: 1000, availableAmount: 800 },
          LEDGER_EVENT_KIND.PRN_CREATED,
          100,
          POOL.DECEMBER
        )
      ).toThrow('Cannot debit the December pool')
    })

    it('throws on issue when the December pool is drawn but the opening carries no December portion', () => {
      expect(() =>
        closingForPrn(
          { amount: 1000, availableAmount: 800 },
          LEDGER_EVENT_KIND.PRN_ISSUED,
          100,
          POOL.DECEMBER
        )
      ).toThrow('Cannot debit the December pool')
    })
  })
})
