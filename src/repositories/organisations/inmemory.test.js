import { describe, beforeEach } from 'vitest'
import { createInMemoryOrganisationsRepository } from './inmemory.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'

describe('In-memory organisations repository', () => {
  describe('organisations repository contract', () => {
    let repositoryFactory

    beforeEach(() => {
      repositoryFactory = createInMemoryOrganisationsRepository([])
    })

    testOrganisationsRepositoryContract(() => repositoryFactory())
  })
})
