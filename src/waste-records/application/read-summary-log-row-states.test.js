import { describe, it, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '#waste-records/repository/test-data.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { partialMock } from '#test/type-helpers.js'
import {
  latestSubmittedSummaryLogRowStates,
  summaryLogRowStatesForRegistration
} from './read-summary-log-row-states.js'

/**
 * @import { LedgerEvent } from '#waste-balances/repository/ledger-schema.js'
 */

/**
 * @param {number} number
 * @param {string} summaryLogId
 * @param {Date} [submittedAt]
 * @returns {LedgerEvent}
 */
const submissionEvent = (number, summaryLogId, submittedAt) =>
  partialMock(
    buildLedgerEvent({
      number,
      payload: { summaryLogId, creditTotal: number * 10 },
      ...(submittedAt && { createdAt: submittedAt })
    })
  )

const registration = {
  organisationId: DEFAULT_LEDGER_ID.organisationId,
  registrationId: DEFAULT_LEDGER_ID.registrationId,
  accreditationId: DEFAULT_LEDGER_ID.accreditationId
}

describe('summaryLogRowStatesForRegistration', () => {
  it('returns an empty array when the stream has no submission', async () => {
    const states = await summaryLogRowStatesForRegistration({
      ledgerRepository: createInMemoryLedgerRepository()(),
      summaryLogRowStateRepository:
        createInMemorySummaryLogRowStateRepository()(),
      ...registration
    })

    expect(states).toEqual([])
  })

  it('returns the full committed snapshot at the head submission', async () => {
    const summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      DEFAULT_LEDGER_ID,
      [
        buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } }),
        buildSummaryLogRowStateEntry({ rowId: 'row-2', data: { tonnage: 20 } })
      ],
      'log-1'
    )
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      DEFAULT_LEDGER_ID,
      [
        buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 99 } }),
        buildSummaryLogRowStateEntry({ rowId: 'row-2', data: { tonnage: 20 } })
      ],
      'log-2'
    )

    const ledgerRepository = createInMemoryLedgerRepository([
      submissionEvent(1, 'log-1'),
      submissionEvent(2, 'log-2')
    ])()

    const states = await summaryLogRowStatesForRegistration({
      ledgerRepository,
      summaryLogRowStateRepository,
      ...registration
    })

    const dataByRowId = Object.fromEntries(
      states.map((state) => [state.rowId, state.data])
    )
    expect(dataByRowId).toEqual({
      'row-1': { tonnage: 99 },
      'row-2': { tonnage: 20 }
    })
  })

  it('reads the row states of its own ledger when another ledger shares the summary log id', async () => {
    const summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      DEFAULT_LEDGER_ID,
      [buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } })],
      'log-1'
    )
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      { ...DEFAULT_LEDGER_ID, organisationId: 'org-2' },
      [buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 20 } })],
      'log-1'
    )
    const ledgerRepository = createInMemoryLedgerRepository([
      submissionEvent(1, 'log-1')
    ])()

    const states = await summaryLogRowStatesForRegistration({
      ledgerRepository,
      summaryLogRowStateRepository,
      ...registration
    })

    expect(states).toEqual([
      expect.objectContaining({ rowId: 'row-1', data: { tonnage: 10 } })
    ])
  })

  it('projects to domain content, keeping the template the row reported under and dropping storage id, membership and ledger identity', async () => {
    const summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      DEFAULT_LEDGER_ID,
      [buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } })],
      'log-1'
    )
    const ledgerRepository = createInMemoryLedgerRepository([
      submissionEvent(1, 'log-1')
    ])()

    const [state] = await summaryLogRowStatesForRegistration({
      ledgerRepository,
      summaryLogRowStateRepository,
      ...registration
    })

    expect(state).toEqual({
      rowId: 'row-1',
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
      data: { tonnage: 10 },
      classification: {
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 10
      }
    })
  })
})

describe('latestSubmittedSummaryLogRowStates', () => {
  it('returns null when the stream has no submission', async () => {
    const previousSubmission = await latestSubmittedSummaryLogRowStates({
      ledgerRepository: createInMemoryLedgerRepository()(),
      summaryLogRowStateRepository:
        createInMemorySummaryLogRowStateRepository()(),
      ...registration
    })

    expect(previousSubmission).toBeNull()
  })

  it('names the latest submitted summary log with when it was submitted and its row states', async () => {
    const summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      DEFAULT_LEDGER_ID,
      [buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } })],
      'log-1'
    )
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      DEFAULT_LEDGER_ID,
      [
        buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 99 } }),
        buildSummaryLogRowStateEntry({ rowId: 'row-2', data: { tonnage: 20 } })
      ],
      'log-2'
    )

    const submittedAt = new Date('2026-02-20T09:30:00.000Z')
    const ledgerRepository = createInMemoryLedgerRepository([
      submissionEvent(1, 'log-1', new Date('2026-01-15T10:00:00.000Z')),
      submissionEvent(2, 'log-2', submittedAt)
    ])()

    const previousSubmission = await latestSubmittedSummaryLogRowStates({
      ledgerRepository,
      summaryLogRowStateRepository,
      ...registration
    })

    expect(previousSubmission?.summaryLog).toEqual({
      summaryLogId: 'log-2',
      submittedAt
    })

    const dataByRowId = Object.fromEntries(
      (previousSubmission?.wasteRecordStates ?? []).map((state) => [
        state.rowId,
        state.data
      ])
    )
    expect(dataByRowId).toEqual({
      'row-1': { tonnage: 99 },
      'row-2': { tonnage: 20 }
    })
  })
})
