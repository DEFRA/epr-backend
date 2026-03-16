import { it as base, describe } from 'vitest'
import { createInMemoryOverseasSitesRepository } from './inmemory.plugin.js'
import { testOverseasSitesRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  overseasSitesRepository: async ({}, use) => {
    const factory = createInMemoryOverseasSitesRepository([])
    const repository = factory()
    await use(repository)
  }
})

describe('In-memory overseas sites repository', () => {
  testOverseasSitesRepositoryContract(it)
})
