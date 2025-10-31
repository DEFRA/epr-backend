import { randomUUID } from 'node:crypto'
import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createSummaryLogsRepository } from './mongodb.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  summaryLogsRepositoryFactory: async ({ mongoClient }, use) => {
    const database = mongoClient.db('epr-backend')
    const factory = createSummaryLogsRepository(database)
    await use(factory)
  },

  summaryLogsRepository: async ({ summaryLogsRepositoryFactory }, use) => {
    const repository = summaryLogsRepositoryFactory(console)
    await use(repository)
  }
})

describe('MongoDB summary logs repository', () => {
  describe('summary logs repository contract', () => {
    testSummaryLogsRepositoryContract(it)
  })

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
