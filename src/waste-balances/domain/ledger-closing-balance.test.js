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
        {
          amount: 1000,
          availableAmount: 800,
          decemberAmount: 0,
          decemberAvailableAmount: 0
        },
        1500,
        1000
      )
    ).toEqual({
      amount: 1500,
      availableAmount: 1300,
      decemberAmount: 0,
      decemberAvailableAmount: 0
    })
  })

  it('shifts both balances by a negative delta', () => {
    expect(
      closingForSummaryLogSubmitted(
        {
          amount: 1000,
          availableAmount: 800,
          decemberAmount: 0,
          decemberAvailableAmount: 0
        },
        600,
        1000
      )
    ).toEqual({
      amount: 600,
      availableAmount: 400,
      decemberAmount: 0,
      decemberAvailableAmount: 0
    })
  })

  it('leaves both balances unchanged on a zero delta', () => {
    expect(
      closingForSummaryLogSubmitted(
        {
          amount: 1000,
          availableAmount: 800,
          decemberAmount: 0,
          decemberAvailableAmount: 0
        },
        1000,
        1000
      )
    ).toEqual({
      amount: 1000,
      availableAmount: 800,
      decemberAmount: 0,
      decemberAvailableAmount: 0
    })
  })

  it('computes the delta without binary floating-point drift', () => {
    expect(
      closingForSummaryLogSubmitted(
        {
          amount: 0,
          availableAmount: 0,
          decemberAmount: 0,
          decemberAvailableAmount: 0
        },
        0.3,
        0.1
      )
    ).toEqual({
      amount: 0.2,
      availableAmount: 0.2,
      decemberAmount: 0,
      decemberAvailableAmount: 0
    })
  })

  it('moves the December portion by its own delta, leaving the general balance to move by the full delta', () => {
    // Total gains 200 (1000 -> 1200); of that, December gains 150. The general
    // balance (amount - decemberAmount) therefore gains only 50.
    expect(
      closingForSummaryLogSubmitted(
        {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 100,
          decemberAvailableAmount: 100
        },
        1200,
        1000,
        250,
        100
      )
    ).toEqual({
      amount: 1200,
      availableAmount: 1200,
      decemberAmount: 250,
      decemberAvailableAmount: 250
    })
  })

  it('treats an opening with no December portion as zero (a pre-feature snapshot)', () => {
    // An opening written before December accrual carries no December fields;
    // they coalesce to zero, so the December delta accrues from a zero base.
    expect(
      closingForSummaryLogSubmitted(
        { amount: 1000, availableAmount: 1000 },
        1200,
        1000,
        150,
        0
      )
    ).toEqual({
      amount: 1200,
      availableAmount: 1200,
      decemberAmount: 150,
      decemberAvailableAmount: 150
    })
  })

  it('self-corrects the December portion when a resubmission moves tonnage out of December', () => {
    // The total is unchanged, but the December total drops from 150 to 0: the
    // December portion reverses while the general balance grows to absorb it.
    expect(
      closingForSummaryLogSubmitted(
        {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 150,
          decemberAvailableAmount: 150
        },
        1000,
        1000,
        0,
        150
      )
    ).toEqual({
      amount: 1000,
      availableAmount: 1000,
      decemberAmount: 0,
      decemberAvailableAmount: 0
    })
  })
})

describe('closingForPrn', () => {
  const opening = {
    amount: 1000,
    availableAmount: 800,
    decemberAmount: 150,
    decemberAvailableAmount: 150
  }

  it('ringfences available balance on creation, leaving total and December unchanged', () => {
    expect(closingForPrn(opening, LEDGER_EVENT_KIND.PRN_CREATED, 200)).toEqual({
      amount: 1000,
      availableAmount: 600,
      decemberAmount: 150,
      decemberAvailableAmount: 150
    })
  })

  it('deducts total balance on issue, leaving available and December unchanged', () => {
    expect(closingForPrn(opening, LEDGER_EVENT_KIND.PRN_ISSUED, 200)).toEqual({
      amount: 800,
      availableAmount: 800,
      decemberAmount: 150,
      decemberAvailableAmount: 150
    })
  })

  it('returns ringfenced tonnage to available on creation cancellation, leaving December unchanged', () => {
    expect(
      closingForPrn(opening, LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED, 200)
    ).toEqual({
      amount: 1000,
      availableAmount: 1000,
      decemberAmount: 150,
      decemberAvailableAmount: 150
    })
  })

  it('returns tonnage to both balances when an issued PRN is cancelled, leaving December unchanged', () => {
    expect(
      closingForPrn(opening, LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE, 200)
    ).toEqual({
      amount: 1200,
      availableAmount: 1000,
      decemberAmount: 150,
      decemberAvailableAmount: 150
    })
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
})
