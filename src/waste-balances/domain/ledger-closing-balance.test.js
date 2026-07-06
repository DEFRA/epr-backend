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
})
