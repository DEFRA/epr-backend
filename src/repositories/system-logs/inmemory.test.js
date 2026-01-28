import { describe, expect, it as base } from 'vitest'
import { createSystemLogsRepository } from './inmemory.js'
import { testSystemLogsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  systemLogsRepository: async ({}, use) => {
    const factory = () => createSystemLogsRepository()(null)
    await use(factory)
  }
})

describe('In memory system logs repository', () => {
  it('should create repository instance', async ({ systemLogsRepository }) => {
    const repository = systemLogsRepository()
    expect(repository).toBeDefined()
  })

  describe('system logs repository contract', () => {
    testSystemLogsRepositoryContract(it)
  })
})
