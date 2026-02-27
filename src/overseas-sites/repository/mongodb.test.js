import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { describe, expect } from 'vitest'
import { createOverseasSitesRepository } from './mongodb.js'
import { testOverseasSitesRepositoryContract } from './port.contract.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  overseasSitesRepositoryFactory: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database.collection('overseas-sites').deleteMany({})
    const factory = await createOverseasSitesRepository(database)
    await use(factory)
  },

  overseasSitesRepository: async ({ overseasSitesRepositoryFactory }, use) => {
    const repository = overseasSitesRepositoryFactory()
    await use(repository)
  }
})

describe('MongoDB overseas sites repository', () => {
  describe('overseas sites repository contract', () => {
    testOverseasSitesRepositoryContract(it)
  })

  describe('ensureNameCountryIndex', () => {
    it('creates name_country compound index when no index exists', async () => {
      const createdIndexes = []

      const mockDb = {
        collection: function () {
          return this
        },
        createIndex: async (fields, options) => {
          createdIndexes.push({ fields, options })
        },
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return { toArray: async () => [] }
        },
        deleteOne: async () => ({ deletedCount: 0 }),
        findOneAndUpdate: async () => null
      }

      await createOverseasSitesRepository(mockDb)

      const nameCountryIndex = createdIndexes.find(
        (idx) => idx.options.name === 'name_country'
      )
      expect(nameCountryIndex).toBeDefined()
      expect(nameCountryIndex.fields).toStrictEqual({
        name: 1,
        country: 1
      })
    })

    it('handles NamespaceNotFound error when collection is new', async () => {
      const nsError = new Error('ns not found')
      nsError.codeName = 'NamespaceNotFound'

      const mockDb = {
        collection: function () {
          return this
        },
        createIndex: async () => {
          throw nsError
        },
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return { toArray: async () => [] }
        },
        deleteOne: async () => ({ deletedCount: 0 }),
        findOneAndUpdate: async () => null
      }

      const factory = await createOverseasSitesRepository(mockDb)
      expect(factory).toBeTypeOf('function')
    })

    it('re-throws non-NamespaceNotFound errors', async () => {
      const connectionError = new Error('Connection refused')
      connectionError.codeName = 'NetworkError'

      const mockDb = {
        collection: function () {
          return this
        },
        createIndex: async () => {
          throw connectionError
        },
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return { toArray: async () => [] }
        },
        deleteOne: async () => ({ deletedCount: 0 }),
        findOneAndUpdate: async () => null
      }

      await expect(createOverseasSitesRepository(mockDb)).rejects.toThrow(
        'Connection refused'
      )
    })
  })
})
