import { describe, it as base, expect, it } from 'vitest'

import { createInMemoryLedgerRepository } from './ledger-inmemory.js'
import { testLedgerRepositoryContract } from './ledger-port.contract.js'

const extendedIt = base.extend({
  // eslint-disable-next-line no-empty-pattern
  ledgerStorage: async ({}, use) => {
    const storage = []
    await use(storage)
  },
  ledgerRepository: async ({ ledgerStorage }, use) => {
    const factory = createInMemoryLedgerRepository(ledgerStorage)
    await use(factory)
  }
})

describe('waste-balances ledger repository - in-memory implementation', () => {
  it('exposes the ledger port surface', () => {
    const repository = createInMemoryLedgerRepository()()
    expect(repository.insertTransactions).toBeTypeOf('function')
    expect(repository.findLatestByAccreditationId).toBeTypeOf('function')
  })

  testLedgerRepositoryContract(extendedIt)
})
