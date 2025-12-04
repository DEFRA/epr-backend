import { describe, it as base } from 'vitest'
import { createInMemoryWasteRecordsRepository } from './inmemory.js'
import { testWasteRecordsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  wasteBalanceStorage: async ({}, use) => {
    const storage = []
    await use(storage)
  },
  wasteRecordsRepository: async ({ wasteBalanceStorage }, use) => {
    const factory = createInMemoryWasteRecordsRepository(
      [],
      wasteBalanceStorage
    )
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

describe('In-memory waste records repository', () => {
  describe('waste records repository contract', () => {
    testWasteRecordsRepositoryContract(it)
  })
})
