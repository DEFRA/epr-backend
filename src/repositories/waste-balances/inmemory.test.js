import { describe, it as base } from 'vitest'
import { createInMemoryWasteBalancesRepository } from './inmemory.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  wasteBalanceStorage: async ({}, use) => {
    const storage = []
    await use(storage)
  },
  wasteBalancesRepository: async ({ wasteBalanceStorage }, use) => {
    const factory = createInMemoryWasteBalancesRepository(wasteBalanceStorage)
    await use(factory)
  },
  insertWasteBalance: async ({ wasteBalanceStorage }, use) => {
    await use(async (wasteBalance) => {
      wasteBalanceStorage.push(wasteBalance)
    })
  },
  insertWasteBalances: async ({ wasteBalanceStorage }, use) => {
    await use(async (wasteBalances) => {
      wasteBalanceStorage.push(...wasteBalances)
    })
  }
})

describe('waste-balances repository - in-memory implementation', () => {
  testWasteBalancesRepositoryContract(it)
})
