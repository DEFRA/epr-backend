import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { createSystemLogsRepository } from './mongodb.js'
import { testSystemLogsRepositoryContract } from './port.contract.js'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'crypto'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  systemLogsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db('epr-backend')
    const factory = await createSystemLogsRepository(database)
    await use(factory)
  }
})

describe('Mongo DB system logs repository', () => {
  describe('system logs repository contract', () => {
    testSystemLogsRepositoryContract(it)
  })

  it('fails gracefully and logs an error when DB write fails', async () => {
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn()
    }

    let callCount = 0
    const mockDb = {
      collection: () => {
        callCount++
        // First call is for createIndex during setup - let it pass
        if (callCount === 1) {
          return { createIndex: async () => {} }
        }
        // Subsequent calls fail
        throw new Error('error accessing db')
      }
    }
    const collectionSpy = vi.spyOn(mockDb, 'collection')

    const repositoryFactory = await createSystemLogsRepository(mockDb)
    const repository = repositoryFactory(mockLogger)

    const payload = {
      createdAt: new Date(),
      event: { category: 'c', action: 'a' },
      context: { organisationId: randomUUID() }
    }

    await repository.insert(payload)

    expect(collectionSpy).toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalled()
  })
})
