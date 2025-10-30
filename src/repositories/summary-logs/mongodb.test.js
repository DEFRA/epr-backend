import { randomUUID } from 'node:crypto'
import { serverTest as test, describe, expect } from '../../../.vite/db-fixture.js'
import { createSummaryLogsRepository } from './mongodb.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'

describe('MongoDB summary logs repository', () => {
  test('summary logs repository contract', async ({ server }) => {
    const summaryLogsRepositoryFactory = createSummaryLogsRepository(server.db)
    testSummaryLogsRepositoryContract((logger) =>
      summaryLogsRepositoryFactory(logger)
    )
  })

  describe('MongoDB-specific error handling', () => {
    test('re-throws non-duplicate key errors from MongoDB', async () => {
      const mockDb = {
        collection: () => ({
          insertOne: async () => {
            const error = new Error('Connection timeout')
            error.code = 'ETIMEOUT'
            throw error
          }
        })
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createSummaryLogsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      await expect(
        repository.insert(`test-${randomUUID()}`, {
          status: 'validating',
          file: {
            id: `file-${randomUUID()}`,
            name: 'test.xlsx',
            s3: { bucket: 'bucket', key: 'key' }
          }
        })
      ).rejects.toThrow('Connection timeout')
    })
  })
})
