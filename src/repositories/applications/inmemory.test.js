import { describe } from 'vitest'
import { createInMemoryApplicationsRepository } from './inmemory.js'
import { testApplicationsRepositoryContract } from './port.contract.js'

describe('in-memory applications repository', () => {
  testApplicationsRepositoryContract(() =>
    createInMemoryApplicationsRepository()()
  )
})
