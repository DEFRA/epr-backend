import { describe, expect, it as base } from 'vitest'
import { createInMemoryReportsRepository } from './inmemory.js'
import { testReportsRepositoryContract } from './port.contract.js'

const it = base.extend({
  reportsRepository: async ({ reportsStorage }, use) => {
    await use(createInMemoryReportsRepository(reportsStorage))
  }
})

describe('In-memory reports repository', () => {
  it('creates a repository', ({ reportsRepository }) => {
    expect(reportsRepository).toBeDefined()
  })

  describe('reports repository contract', () => {
    testReportsRepositoryContract(it)
  })
})
