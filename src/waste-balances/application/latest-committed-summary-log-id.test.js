import { describe, it, expect } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import {
  buildStreamEvent,
  buildPrnCreatedEvent
} from '../repository/ledger-test-data.js'
import { latestCommittedSummaryLogId } from './latest-committed-summary-log-id.js'

const PARTITION = { registrationId: 'reg-1', accreditationId: 'acc-1' }

describe('latestCommittedSummaryLogId', () => {
  it('returns null when the partition has no events', async () => {
    const ledgerRepository = createInMemoryLedgerRepository()()

    expect(
      await latestCommittedSummaryLogId(ledgerRepository, PARTITION)
    ).toBeNull()
  })

  it('returns null when the partition has events but no submission', async () => {
    const ledgerRepository = createInMemoryLedgerRepository([
      buildPrnCreatedEvent({ number: 1 })
    ])()

    expect(
      await latestCommittedSummaryLogId(ledgerRepository, PARTITION)
    ).toBeNull()
  })

  it('returns the summaryLogId of the only submission', async () => {
    const ledgerRepository = createInMemoryLedgerRepository([
      buildStreamEvent({
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])()

    expect(await latestCommittedSummaryLogId(ledgerRepository, PARTITION)).toBe(
      'log-1'
    )
  })

  it('returns the latest submission, ignoring a later PRN event', async () => {
    const ledgerRepository = createInMemoryLedgerRepository([
      buildStreamEvent({
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      }),
      buildStreamEvent({
        number: 2,
        payload: { summaryLogId: 'log-2', creditTotal: 150 }
      }),
      buildPrnCreatedEvent({ number: 3 })
    ])()

    expect(await latestCommittedSummaryLogId(ledgerRepository, PARTITION)).toBe(
      'log-2'
    )
  })

  it('resolves the committed head for a registered-only ledger', async () => {
    const ledgerRepository = createInMemoryLedgerRepository([
      buildStreamEvent({
        number: 1,
        accreditationId: null,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    ])()

    expect(
      await latestCommittedSummaryLogId(ledgerRepository, {
        registrationId: 'reg-1',
        accreditationId: null
      })
    ).toBe('log-1')
  })
})
