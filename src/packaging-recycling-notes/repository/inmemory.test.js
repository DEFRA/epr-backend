import { describe, it as base } from 'vitest'
import { createInMemoryPackagingRecyclingNotesRepository } from './inmemory.plugin.js'
import { testPackagingRecyclingNotesRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  prnRepository: async ({}, use) => {
    const factory = createInMemoryPackagingRecyclingNotesRepository([])
    const repository = factory()
    await use(repository)
  }
})

describe('In-memory packaging recycling notes repository', () => {
  testPackagingRecyclingNotesRepositoryContract(it)
})
