import { describe, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createPackagingRecyclingNotesRepository } from './mongodb.js'
import { testPackagingRecyclingNotesRepositoryContract } from './port.contract.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  packagingRecyclingNotesRepositoryFactory: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createPackagingRecyclingNotesRepository(database)
    await use(factory)
  },

  packagingRecyclingNotesRepository: async (
    { packagingRecyclingNotesRepositoryFactory },
    use
  ) => {
    const repository = packagingRecyclingNotesRepositoryFactory()
    await use(repository)
  }
})

describe('MongoDB packaging recycling notes repository', () => {
  describe('packaging recycling notes repository contract', () => {
    testPackagingRecyclingNotesRepositoryContract(it)
  })

  describe('factory', () => {
    it('creates the repository with expected methods', async ({
      packagingRecyclingNotesRepository
    }) => {
      expect(packagingRecyclingNotesRepository).toEqual({
        findById: expect.any(Function),
        findByAccreditationId: expect.any(Function)
      })
    })
  })

  describe('indexes', () => {
    it('creates indexes on initialisation', async ({ mongoClient }) => {
      const database = mongoClient.db(DATABASE_NAME)
      await createPackagingRecyclingNotesRepository(database)

      const collection = database.collection('packaging-recycling-notes')
      const indexes = await collection.indexes()

      const indexNames = indexes.map((idx) => idx.name)

      expect(indexNames).toContain('issuedBy_status')
      expect(indexNames).toContain('accreditationId')
    })
  })
})
