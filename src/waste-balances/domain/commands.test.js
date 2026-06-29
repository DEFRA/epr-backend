import { describe, it, expect } from 'vitest'

import {
  submitSummaryLog,
  createPrn,
  issuePrn,
  cancelPrnCreation,
  cancelIssuedPrn,
  acceptPrn,
  rejectPrn
} from './commands.js'

const buildState = (overrides = {}) => ({
  balance: { amount: 1000, availableAmount: 1000 },
  creditTotal: 1000,
  ...overrides
})

describe('submitSummaryLog', () => {
  it('opens an empty ledger: null state yields opening zero and closing the credit total', () => {
    const [recorded] = submitSummaryLog(null, {
      summaryLogId: 'log-1',
      creditTotal: 1500
    })

    expect(recorded.kind).toBe('summary-log-submitted')
    expect(recorded.payload).toEqual({
      summaryLogId: 'log-1',
      creditTotal: 1500
    })
    expect(recorded.openingBalance).toEqual({ amount: 0, availableAmount: 0 })
    expect(recorded.closingBalance).toEqual({
      amount: 1500,
      availableAmount: 1500
    })
  })

  it('subsequent submission: delta against the state credit total', () => {
    const [recorded] = submitSummaryLog(
      buildState({
        balance: { amount: 2000, availableAmount: 1200 },
        creditTotal: 2000
      }),
      { summaryLogId: 'log-2', creditTotal: 3500 }
    )

    expect(recorded.openingBalance).toEqual({
      amount: 2000,
      availableAmount: 1200
    })
    expect(recorded.closingBalance).toEqual({
      amount: 3500,
      availableAmount: 2700
    })
  })
})

describe('createPrn', () => {
  it('decrements availableAmount when sufficient; amount unchanged', () => {
    const [recorded] = createPrn(
      buildState({ balance: { amount: 1000, availableAmount: 1000 } }),
      { prnId: 'prn-1', amount: 300 }
    )

    expect(recorded.kind).toBe('prn-created')
    expect(recorded.payload).toEqual({ prnId: 'prn-1', amount: 300 })
    expect(recorded.closingBalance).toEqual({
      amount: 1000,
      availableAmount: 700
    })
  })

  it('throws when availableAmount is below the PRN amount', () => {
    expect(() =>
      createPrn(
        buildState({ balance: { amount: 1000, availableAmount: 200 } }),
        {
          prnId: 'prn-1',
          amount: 300
        }
      )
    ).toThrow('Insufficient available waste balance')
  })

  it('throws when no ledger exists', () => {
    expect(() => createPrn(null, { prnId: 'prn-1', amount: 300 })).toThrow(
      'No waste balance ledger'
    )
  })
})

describe('issuePrn', () => {
  it('decrements amount when sufficient; availableAmount unchanged', () => {
    const [recorded] = issuePrn(
      buildState({ balance: { amount: 1000, availableAmount: 700 } }),
      { prnId: 'prn-1', amount: 300 }
    )

    expect(recorded.kind).toBe('prn-issued')
    expect(recorded.closingBalance).toEqual({
      amount: 700,
      availableAmount: 700
    })
  })

  it('throws when amount is below the PRN amount', () => {
    expect(() =>
      issuePrn(buildState({ balance: { amount: 200, availableAmount: 700 } }), {
        prnId: 'prn-1',
        amount: 300
      })
    ).toThrow('Insufficient total waste balance')
  })

  it('throws when no ledger exists', () => {
    expect(() => issuePrn(null, { prnId: 'prn-1', amount: 300 })).toThrow(
      'No waste balance ledger'
    )
  })
})

describe('prn cancellations credit without a sufficiency check', () => {
  it('cancelPrnCreation credits availableAmount', () => {
    const [recorded] = cancelPrnCreation(
      buildState({ balance: { amount: 1000, availableAmount: 700 } }),
      { prnId: 'prn-1', amount: 300 }
    )

    expect(recorded.kind).toBe('prn-creation-cancelled')
    expect(recorded.closingBalance).toEqual({
      amount: 1000,
      availableAmount: 1000
    })
  })

  it('cancelIssuedPrn credits both amount and availableAmount', () => {
    const [recorded] = cancelIssuedPrn(
      buildState({ balance: { amount: 700, availableAmount: 700 } }),
      { prnId: 'prn-1', amount: 300 }
    )

    expect(recorded.kind).toBe('prn-cancelled-after-issue')
    expect(recorded.closingBalance).toEqual({
      amount: 1000,
      availableAmount: 1000
    })
  })

  it('cancelPrnCreation throws when no ledger exists', () => {
    expect(() =>
      cancelPrnCreation(null, { prnId: 'prn-1', amount: 300 })
    ).toThrow('No waste balance ledger')
  })

  it('cancelIssuedPrn throws when no ledger exists', () => {
    expect(() =>
      cancelIssuedPrn(null, { prnId: 'prn-1', amount: 300 })
    ).toThrow('No waste balance ledger')
  })
})

describe('status-only commands leave the balance unchanged', () => {
  it('acceptPrn', () => {
    const [recorded] = acceptPrn(
      buildState({ balance: { amount: 700, availableAmount: 700 } }),
      { prnId: 'prn-1', amount: 300 }
    )

    expect(recorded.kind).toBe('prn-accepted')
    expect(recorded.closingBalance).toEqual({
      amount: 700,
      availableAmount: 700
    })
  })

  it('rejectPrn', () => {
    const [recorded] = rejectPrn(
      buildState({ balance: { amount: 700, availableAmount: 700 } }),
      { prnId: 'prn-1', amount: 300 }
    )

    expect(recorded.kind).toBe('prn-rejected')
    expect(recorded.closingBalance).toEqual({
      amount: 700,
      availableAmount: 700
    })
  })

  it('acceptPrn throws when no ledger exists', () => {
    expect(() => acceptPrn(null, { prnId: 'prn-1', amount: 0 })).toThrow(
      'No waste balance ledger'
    )
  })

  it('rejectPrn throws when no ledger exists', () => {
    expect(() => rejectPrn(null, { prnId: 'prn-1', amount: 0 })).toThrow(
      'No waste balance ledger'
    )
  })
})
