import { describe, it as base, expect } from 'vitest'

import { createInMemorySummaryLogRowStateRepository } from './inmemory.js'
import { testSummaryLogRowStateRepositoryContract } from './port.contract.js'
import { DEFAULT_LEDGER_ID } from './test-data.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  summaryLogRowStateRepository: async ({}, use) => {
    await use(createInMemorySummaryLogRowStateRepository())
  }
})

describe('summary-log row states repository - in-memory implementation', () => {
  it('exposes the row-state port surface', () => {
    const repository = createInMemorySummaryLogRowStateRepository()()
    expect(repository.upsertSummaryLogRowStates).toBeTypeOf('function')
    expect(repository.findRowStatesForSummaryLog).toBeTypeOf('function')
    expect(repository.findRowHistory).toBeTypeOf('function')
  })

  it('seeds storage from the provided initial state documents', async () => {
    const repository = createInMemorySummaryLogRowStateRepository([
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

    const committed = await repository.findRowStatesForSummaryLog(
      DEFAULT_LEDGER_ID,
      'log-seed'
    )
    expect(committed).toHaveLength(1)
    expect(committed[0].id).toBe('seed-1')
  })

  testSummaryLogRowStateRepositoryContract(it)
})
