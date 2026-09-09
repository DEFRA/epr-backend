import { describe, it, expect } from 'vitest'

import { LEDGER_EVENT_KIND, ZERO_BALANCE } from '../repository/ledger-schema.js'
import {
  submitSummaryLog,
  createPrn,
  issuePrn,
  cancelPrnCreation,
  cancelIssuedPrn,
  acceptPrn,
  rejectPrn,
  PRN_COMMAND_STATUS,
  PRN_COMMAND_REJECTION
} from './commands.js'

describe('submitSummaryLog', () => {
  it('opens a ledger from zero on the first submission', () => {
    expect(
      submitSummaryLog(null, { summaryLogId: 'log-1', creditTotal: 150 })
    ).toEqual([
      {
        kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-1', creditTotal: 150 },
        openingBalance: ZERO_BALANCE,
        closingBalance: { amount: 150, availableAmount: 150 }
      }
    ])
  })

  it('shifts the balance by the delta against the previous credit total', () => {
    const state = {
      balance: { amount: 150, availableAmount: 120 },
      creditTotal: 150,
      decemberCreditTotal: 0
    }

    expect(
      submitSummaryLog(state, { summaryLogId: 'log-2', creditTotal: 200 })
    ).toEqual([
      {
        kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-2', creditTotal: 200 },
        openingBalance: { amount: 150, availableAmount: 120 },
        closingBalance: { amount: 200, availableAmount: 170 }
      }
    ])
  })

  it('lowers the balance when a resubmission reduces the credit total', () => {
    const state = {
      balance: { amount: 200, availableAmount: 170 },
      creditTotal: 200,
      decemberCreditTotal: 0
    }

    expect(
      submitSummaryLog(state, { summaryLogId: 'log-3', creditTotal: 150 })
    ).toEqual([
      {
        kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-3', creditTotal: 150 },
        openingBalance: { amount: 200, availableAmount: 170 },
        closingBalance: { amount: 150, availableAmount: 120 }
      }
    ])
  })
})

describe('createPrn', () => {
  it('commits a prn-created event ringfencing the available balance', () => {
    expect(
      createPrn(
        { amount: 1000, availableAmount: 1000 },
        {
          prnId: 'prn-1',
          amount: 100
        }
      )
    ).toEqual({
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: [
        {
          kind: LEDGER_EVENT_KIND.PRN_CREATED,
          payload: { prnId: 'prn-1', amount: 100 },
          openingBalance: { amount: 1000, availableAmount: 1000 },
          closingBalance: { amount: 1000, availableAmount: 900 }
        }
      ]
    })
  })

  it('commits when the tonnage equals the available balance exactly', () => {
    expect(
      createPrn(
        { amount: 500, availableAmount: 100 },
        {
          prnId: 'prn-1',
          amount: 100
        }
      )
    ).toEqual({
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: [
        {
          kind: LEDGER_EVENT_KIND.PRN_CREATED,
          payload: { prnId: 'prn-1', amount: 100 },
          openingBalance: { amount: 500, availableAmount: 100 },
          closingBalance: { amount: 500, availableAmount: 0 }
        }
      ]
    })
  })

  it('rejects when the tonnage exceeds the available balance', () => {
    expect(
      createPrn(
        { amount: 500, availableAmount: 50 },
        {
          prnId: 'prn-1',
          amount: 100
        }
      )
    ).toEqual({
      status: PRN_COMMAND_STATUS.REJECTED,
      reason: PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE
    })
  })
})

describe('issuePrn', () => {
  it('commits a prn-issued event deducting the total balance', () => {
    expect(
      issuePrn(
        { amount: 1000, availableAmount: 900 },
        {
          prnId: 'prn-1',
          amount: 75
        }
      )
    ).toEqual({
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: [
        {
          kind: LEDGER_EVENT_KIND.PRN_ISSUED,
          payload: { prnId: 'prn-1', amount: 75 },
          openingBalance: { amount: 1000, availableAmount: 900 },
          closingBalance: { amount: 925, availableAmount: 900 }
        }
      ]
    })
  })

  it('rejects when the tonnage exceeds the total balance', () => {
    expect(
      issuePrn(
        { amount: 50, availableAmount: 200 },
        {
          prnId: 'prn-1',
          amount: 100
        }
      )
    ).toEqual({
      status: PRN_COMMAND_STATUS.REJECTED,
      reason: PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE
    })
  })
})

describe('createPrn — December pool', () => {
  // A balance carrying a December portion: 100 of the 500 available is
  // December-reserved.
  const balanceWithDecember = {
    amount: 500,
    availableAmount: 500,
    decemberAmount: 100,
    decemberAvailableAmount: 100
  }

  it('ringfences both the December and the general available on a December PRN', () => {
    expect(
      createPrn(balanceWithDecember, {
        prnId: 'prn-1',
        amount: 40,
        isDecemberWaste: true
      })
    ).toEqual({
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: [
        {
          kind: LEDGER_EVENT_KIND.PRN_CREATED,
          payload: { prnId: 'prn-1', amount: 40, isDecemberWaste: true },
          openingBalance: balanceWithDecember,
          closingBalance: {
            amount: 500,
            availableAmount: 460,
            decemberAmount: 100,
            decemberAvailableAmount: 60
          }
        }
      ]
    })
  })

  it('refuses a December PRN when the balance has no December pool at all', () => {
    // AC5 at the extreme: an operator with zero December available (no December
    // tonnage ever accrued, so the field is absent) cannot raise a December PRN.
    expect(
      createPrn(
        { amount: 500, availableAmount: 500 },
        { prnId: 'prn-1', amount: 10, isDecemberWaste: true }
      )
    ).toEqual({
      status: PRN_COMMAND_STATUS.REJECTED,
      reason: PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE
    })
  })

  it('rejects a December PRN over the December available, though the general balance has room', () => {
    expect(
      createPrn(balanceWithDecember, {
        prnId: 'prn-1',
        amount: 150,
        isDecemberWaste: true
      })
    ).toEqual({
      status: PRN_COMMAND_STATUS.REJECTED,
      reason: PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE
    })
  })

  it('reserves the December portion from a general PRN, capping it at available minus December', () => {
    // available 500 minus December-available 100 leaves 400 for general; 401 is refused.
    expect(
      createPrn(balanceWithDecember, { prnId: 'prn-1', amount: 401 })
    ).toEqual({
      status: PRN_COMMAND_STATUS.REJECTED,
      reason: PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE
    })
  })

  it('commits a general PRN within available minus December, leaving the December portion untouched', () => {
    expect(
      createPrn(balanceWithDecember, { prnId: 'prn-1', amount: 400 })
    ).toEqual({
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: [
        {
          kind: LEDGER_EVENT_KIND.PRN_CREATED,
          payload: { prnId: 'prn-1', amount: 400 },
          openingBalance: balanceWithDecember,
          closingBalance: {
            amount: 500,
            availableAmount: 100,
            decemberAmount: 100,
            decemberAvailableAmount: 100
          }
        }
      ]
    })
  })
})

describe('issuePrn — December pool', () => {
  const balanceWithDecember = {
    amount: 500,
    availableAmount: 500,
    decemberAmount: 100,
    decemberAvailableAmount: 100
  }

  it('deducts both the December and the general total on a December PRN', () => {
    expect(
      issuePrn(balanceWithDecember, {
        prnId: 'prn-1',
        amount: 40,
        isDecemberWaste: true
      })
    ).toEqual({
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: [
        {
          kind: LEDGER_EVENT_KIND.PRN_ISSUED,
          payload: { prnId: 'prn-1', amount: 40, isDecemberWaste: true },
          openingBalance: balanceWithDecember,
          closingBalance: {
            amount: 460,
            availableAmount: 500,
            decemberAmount: 60,
            decemberAvailableAmount: 100
          }
        }
      ]
    })
  })

  it('rejects a December PRN issue over the December total balance', () => {
    expect(
      issuePrn(balanceWithDecember, {
        prnId: 'prn-1',
        amount: 150,
        isDecemberWaste: true
      })
    ).toEqual({
      status: PRN_COMMAND_STATUS.REJECTED,
      reason: PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE
    })
  })

  it('reserves the December portion from a general PRN issue, capping it at total minus December', () => {
    // total 500 minus December 100 leaves 400 for general; 401 is refused.
    expect(
      issuePrn(balanceWithDecember, { prnId: 'prn-1', amount: 401 })
    ).toEqual({
      status: PRN_COMMAND_STATUS.REJECTED,
      reason: PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE
    })
  })
})

describe('cancelPrnCreation', () => {
  it('commits a prn-creation-cancelled event crediting the available balance', () => {
    expect(
      cancelPrnCreation(
        { amount: 1000, availableAmount: 925 },
        {
          prnId: 'prn-1',
          amount: 75
        }
      )
    ).toEqual({
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: [
        {
          kind: LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED,
          payload: { prnId: 'prn-1', amount: 75 },
          openingBalance: { amount: 1000, availableAmount: 925 },
          closingBalance: { amount: 1000, availableAmount: 1000 }
        }
      ]
    })
  })
})

describe('cancelIssuedPrn', () => {
  it('commits a prn-cancelled-after-issue event crediting both balances', () => {
    expect(
      cancelIssuedPrn(
        { amount: 440, availableAmount: 940 },
        {
          prnId: 'prn-1',
          amount: 60
        }
      )
    ).toEqual({
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: [
        {
          kind: LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
          payload: { prnId: 'prn-1', amount: 60 },
          openingBalance: { amount: 440, availableAmount: 940 },
          closingBalance: { amount: 500, availableAmount: 1000 }
        }
      ]
    })
  })
})

describe('acceptPrn', () => {
  it('commits a prn-accepted event leaving the balance unchanged', () => {
    expect(
      acceptPrn(
        { amount: 500, availableAmount: 400 },
        {
          prnId: 'prn-1',
          amount: 50
        }
      )
    ).toEqual({
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: [
        {
          kind: LEDGER_EVENT_KIND.PRN_ACCEPTED,
          payload: { prnId: 'prn-1', amount: 50 },
          openingBalance: { amount: 500, availableAmount: 400 },
          closingBalance: { amount: 500, availableAmount: 400 }
        }
      ]
    })
  })
})

describe('rejectPrn', () => {
  it('commits a prn-rejected event leaving the balance unchanged', () => {
    expect(
      rejectPrn(
        { amount: 500, availableAmount: 400 },
        {
          prnId: 'prn-1',
          amount: 50
        }
      )
    ).toEqual({
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: [
        {
          kind: LEDGER_EVENT_KIND.PRN_REJECTED,
          payload: { prnId: 'prn-1', amount: 50 },
          openingBalance: { amount: 500, availableAmount: 400 },
          closingBalance: { amount: 500, availableAmount: 400 }
        }
      ]
    })
  })
})
