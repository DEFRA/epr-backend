import { describe, expect, it as base } from 'vitest'
import { createInMemoryReportsRepository } from './inmemory.js'
import { testReportsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  reportsRepository: async ({}, use) => {
    await use(createInMemoryReportsRepository())
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
