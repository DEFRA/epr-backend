import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import {
  setupRepositoryDb,
  teardownRepositoryDb
} from '../../../.vite/fixtures/repository-db.js'
import { createSummaryLogsRepository } from './mongodb.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'

describe('MongoDB summary logs repository', () => {
  let mongoClient
  let summaryLogsRepositoryFactory

  beforeAll(async () => {
    const { db, mongoClient: client } = await setupRepositoryDb()
    mongoClient = client
    summaryLogsRepositoryFactory = createSummaryLogsRepository(db)
  })

  afterAll(async () => {
    await teardownRepositoryDb(mongoClient)
  })

  testSummaryLogsRepositoryContract((logger) =>
    summaryLogsRepositoryFactory(logger)
  )

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-duplicate key errors from MongoDB', async () => {
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
