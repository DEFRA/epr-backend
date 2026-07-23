import { describe, it, expect } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import {
  buildLedgerEvent,
  buildLedgerId,
  buildPrnCreatedEvent
} from '../repository/ledger-test-data.js'
import { latestSubmittedSummaryLogId } from './latest-submitted-summary-log-id.js'
import { partialMock } from '#test/type-helpers.js'

const LEDGER_ID = buildLedgerId()

describe('latestSubmittedSummaryLogId', () => {
  it('returns null when the ledger has no events', async () => {
    const ledgerRepository = createInMemoryLedgerRepository()()

    expect(
      await latestSubmittedSummaryLogId(ledgerRepository, LEDGER_ID)
    ).toBeNull()
  })

  it('returns null when the ledger has events but no submission', async () => {
    const ledgerRepository = createInMemoryLedgerRepository([
      partialMock(buildPrnCreatedEvent({ number: 1 }))
    ])()

    expect(
      await latestSubmittedSummaryLogId(ledgerRepository, LEDGER_ID)
    ).toBeNull()
  })

  it('returns the summaryLogId of the only submission', async () => {
    const ledgerRepository = createInMemoryLedgerRepository([
      partialMock(
        buildLedgerEvent({
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      )
    ])()

    expect(await latestSubmittedSummaryLogId(ledgerRepository, LEDGER_ID)).toBe(
      'log-1'
    )
  })

  it('returns the latest submission, ignoring a later PRN event', async () => {
    const ledgerRepository = createInMemoryLedgerRepository([
      partialMock(
        buildLedgerEvent({
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      ),
      partialMock(
        buildLedgerEvent({
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 150 }
        })
      ),
      partialMock(buildPrnCreatedEvent({ number: 3 }))
    ])()

    expect(await latestSubmittedSummaryLogId(ledgerRepository, LEDGER_ID)).toBe(
      'log-2'
    )
  })

  it('resolves the head for a registered-only ledger', async () => {
    const ledgerRepository = createInMemoryLedgerRepository([
      partialMock(
        buildLedgerEvent({
          number: 1,
          accreditationId: null,
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      )
    ])()

    expect(
      await latestSubmittedSummaryLogId(
        ledgerRepository,
        buildLedgerId({ accreditationId: null })
      )
    ).toBe('log-1')
  })
})
