import { describe, it, expect } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import {
  buildLedgerEvent,
  buildPrnCreatedEvent
} from '../repository/ledger-test-data.js'
import { latestSubmittedSummaryLog } from './latest-submitted-summary-log.js'

const LEDGER_ID = { registrationId: 'reg-1', accreditationId: 'acc-1' }

describe('latestSubmittedSummaryLog', () => {
  it('returns null when the ledger has no events', async () => {
    const ledgerRepository = createInMemoryLedgerRepository()()

    expect(
      await latestSubmittedSummaryLog(ledgerRepository, LEDGER_ID)
    ).toBeNull()
  })

  it('returns null when the ledger has events but no submission', async () => {
    const ledgerRepository = createInMemoryLedgerRepository([
      buildPrnCreatedEvent({ number: 1 })
    ])()

    expect(
      await latestSubmittedSummaryLog(ledgerRepository, LEDGER_ID)
    ).toBeNull()
  })

  it('returns the latest submitted summaryLogId and its submitted timestamp', async () => {
    const submittedAt = new Date('2026-02-15T15:09:00.000Z')
    const ledgerRepository = createInMemoryLedgerRepository([
      buildLedgerEvent({
        number: 1,
        createdAt: submittedAt,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])()

    expect(
      await latestSubmittedSummaryLog(ledgerRepository, LEDGER_ID)
    ).toEqual({ summaryLogId: 'log-1', submittedAt })
  })

  it('returns the latest submission, ignoring a later PRN event', async () => {
    const submittedAt = new Date('2026-03-01T12:00:00.000Z')
    const ledgerRepository = createInMemoryLedgerRepository([
      buildLedgerEvent({
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      }),
      buildLedgerEvent({
        number: 2,
        createdAt: submittedAt,
        payload: { summaryLogId: 'log-2', creditTotal: 150 }
      }),
      buildPrnCreatedEvent({ number: 3 })
    ])()

    expect(
      await latestSubmittedSummaryLog(ledgerRepository, LEDGER_ID)
    ).toEqual({ summaryLogId: 'log-2', submittedAt })
  })

  it('resolves the head for a registered-only ledger', async () => {
    const submittedAt = new Date('2026-01-15T10:00:00.000Z')
    const ledgerRepository = createInMemoryLedgerRepository([
      buildLedgerEvent({
        number: 1,
        accreditationId: null,
        createdAt: submittedAt,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])()

    expect(
      await latestSubmittedSummaryLog(ledgerRepository, {
        registrationId: 'reg-1',
        accreditationId: null
      })
    ).toEqual({ summaryLogId: 'log-1', submittedAt })
  })
})
