import { describe, it as base, expect } from 'vitest'

import { createInMemorySummaryLogRowStatesRepository } from './inmemory.js'
import { testSummaryLogRowStatesRepositoryContract } from './port.contract.js'
import { DEFAULT_LEDGER_ID } from './test-data.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  summaryLogRowStatesRepository: async ({}, use) => {
    await use(createInMemorySummaryLogRowStatesRepository())
  }
})

describe('summary-log row states repository - in-memory implementation', () => {
  it('exposes the row-state port surface', () => {
    const repository = createInMemorySummaryLogRowStatesRepository()()
    expect(repository.upsertSummaryLogRowStates).toBeTypeOf('function')
    expect(repository.findWasteRecordStatesForSummaryLog).toBeTypeOf('function')
    expect(repository.findRowHistory).toBeTypeOf('function')
  })

  it('seeds storage from the provided initial state documents', async () => {
    const repository = createInMemorySummaryLogRowStatesRepository([
      {
        id: 'seed-1',
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        wasteRecordType: 'received',
        rowId: 'row-1',
        processingType: 'REPROCESSOR_INPUT',
        data: { tonnage: 10 },
        classification: {
          outcome: 'INCLUDED',
          reasons: [],
          transactionAmount: 10
        },
        summaryLogIds: ['log-seed']
      }
    ])()

    const committed = await repository.findWasteRecordStatesForSummaryLog(
      DEFAULT_LEDGER_ID,
      'log-seed'
    )
    expect(committed).toEqual([
      {
        rowId: 'row-1',
        wasteRecordType: 'received',
        processingType: 'REPROCESSOR_INPUT',
        data: { tonnage: 10 },
        classification: {
          outcome: 'INCLUDED',
          reasons: [],
          transactionAmount: 10
        }
      }
    ])
  })

  testSummaryLogRowStatesRepositoryContract(it)
})
