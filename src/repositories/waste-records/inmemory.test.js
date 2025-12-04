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
  }
})

describe('In-memory waste records repository', () => {
  describe('waste records repository contract', () => {
    testWasteRecordsRepositoryContract(it)
  })
})
