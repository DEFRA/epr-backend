import { randomUUID } from 'node:crypto'
import { describe, vi, expect, it as base } from 'vitest'
import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'
import { summaryLogFactory } from './contract/test-data.js'
import { waitForVersion } from './contract/test-helpers.js'

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}

const it = base.extend({
  // Factory for contract tests that need to pass their own logger
  // eslint-disable-next-line no-empty-pattern
  summaryLogsRepositoryFactory: async ({}, use) => {
    await use((logger) => createInMemorySummaryLogsRepository(logger))
  },

  summaryLogsRepository: async ({ summaryLogsRepositoryFactory }, use) => {
    const repository = summaryLogsRepositoryFactory(mockLogger)
    await use(repository)
  }
})

describe('In-memory summary logs repository', () => {
  describe('summary logs repository contract', () => {
    testSummaryLogsRepositoryContract(it)
  })

  describe('data isolation', () => {
    it('returns independent copies that cannot modify stored data', async () => {
      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repository = createInMemorySummaryLogsRepository(mockLogger)
      const id = `isolation-test-${randomUUID()}`

      await repository.insert(
        id,
        summaryLogFactory.validating({ file: { name: 'original.xlsx' } })
      )

      const retrieved = await repository.findById(id)
      retrieved.summaryLog.file.name = 'modified.xlsx'
      retrieved.summaryLog.file.uri = 's3://hacked-bucket/hacked-key'

      const retrievedAgain = await repository.findById(id)
      expect(retrievedAgain.summaryLog.file.name).toBe('original.xlsx')
      expect(retrievedAgain.summaryLog.file.uri).toBe(
        's3://test-bucket/test-key'
      )
    })

    it('stores independent copies that cannot be modified by input mutation', async () => {
      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repository = createInMemorySummaryLogsRepository(mockLogger)
      const id = `isolation-test-${randomUUID()}`
      const summaryLog = summaryLogFactory.validating({
        file: { name: 'original.xlsx' }
      })

      await repository.insert(id, summaryLog)

      summaryLog.file.name = 'mutated.xlsx'
      summaryLog.file.uri = 's3://mutated-bucket/mutated-key'

      const retrieved = await repository.findById(id)
      expect(retrieved.summaryLog.file.name).toBe('original.xlsx')
      expect(retrieved.summaryLog.file.uri).toBe('s3://test-bucket/test-key')
    })

    it('stores independent copies on update', async () => {
      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repository = createInMemorySummaryLogsRepository(mockLogger)
      const id = `isolation-test-${randomUUID()}`

      await repository.insert(id, summaryLogFactory.validating())

      const updates = summaryLogFactory.validated({
        file: { name: 'updated.xlsx' }
      })
      await repository.update(id, 1, updates)

      updates.file.name = 'mutated.xlsx'
      updates.file.uri = 's3://evil-bucket/evil-key'

      const retrieved = await waitForVersion(repository, id, 2)
      expect(retrieved.summaryLog.file.name).toBe('updated.xlsx')
      expect(retrieved.summaryLog.file.uri).toBe('s3://test-bucket/test-key')
    })
  })
})
