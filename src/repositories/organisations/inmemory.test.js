import { describe, it as base } from 'vitest'
import { createInMemoryOrganisationsRepository } from './inmemory.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  organisationsRepository: async ({}, use) => {
    const factory = createInMemoryOrganisationsRepository([])
    await use(factory)
  }
})

describe('In-memory organisations repository', () => {
  describe('organisations repository contract', () => {
    testOrganisationsRepositoryContract(it)
  })
})
