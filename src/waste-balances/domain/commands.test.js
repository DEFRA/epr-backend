import { describe, it, expect } from 'vitest'

import { STREAM_EVENT_KIND, ZERO_BALANCE } from '../repository/stream-schema.js'
import { submitSummaryLog } from './commands.js'

describe('submitSummaryLog', () => {
  it('opens a ledger from zero on the first submission', () => {
    expect(
      submitSummaryLog(null, { summaryLogId: 'log-1', creditTotal: 150 })
    ).toEqual([
      {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
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
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
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
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-3', creditTotal: 150 },
        openingBalance: { amount: 200, availableAmount: 170 },
        closingBalance: { amount: 150, availableAmount: 120 }
      }
    ])
  })
})
