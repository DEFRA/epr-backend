import { describe, expect, it as base, vi } from 'vitest'
import { createSystemLogsRepository } from './inmemory.js'
import { testSystemLogsRepositoryContract } from './port.contract.js'

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  systemLogsRepository: async ({}, use) => {
    const repository = createSystemLogsRepository(mockLogger)
    await use(repository)
  }
})

describe('In memory system logs repository', () => {
  it('should create repository instance', async ({ systemLogsRepository }) => {
    expect(systemLogsRepository).toBeDefined()
  })

  describe('system logs repository contract', () => {
    testSystemLogsRepositoryContract(it)
  })
})
