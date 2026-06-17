import { describe, it as base, expect } from 'vitest'

import { createInMemoryRowStateRepository } from './row-states-inmemory.js'
import { testRowStateRepositoryContract } from './row-states-port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  rowStateRepository: async ({}, use) => {
    await use(createInMemoryRowStateRepository())
  }
})

describe('committed row-states repository - in-memory implementation', () => {
  it('exposes the row-state port surface', () => {
    const repository = createInMemoryRowStateRepository()()
    expect(repository.upsertRowStates).toBeTypeOf('function')
    expect(repository.findBySummaryLogId).toBeTypeOf('function')
    expect(repository.findRowHistory).toBeTypeOf('function')
  })

  it('seeds storage from the provided initial state documents', async () => {
    const repository = createInMemoryRowStateRepository([
      {
        id: 'seed-1',
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        wasteRecordType: 'received',
        rowId: 'row-1',
        data: { tonnage: 10 },
        classification: {
          outcome: 'INCLUDED',
          reasons: [],
          transactionAmount: 10
        },
        summaryLogIds: ['log-seed']
      }
    ])()

    const committed = await repository.findBySummaryLogId('log-seed')
    expect(committed).toHaveLength(1)
    expect(committed[0].id).toBe('seed-1')
  })

  testRowStateRepositoryContract(it)
})
