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
      creditTotal: 150
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
      creditTotal: 200
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
