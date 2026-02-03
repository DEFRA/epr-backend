import { describe, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import {
  createPackagingRecyclingNotesRepository,
  PrnNumberConflictError
} from './mongodb.js'
import { testPackagingRecyclingNotesRepositoryContract } from './port.contract.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  prnRepositoryFactory: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createPackagingRecyclingNotesRepository(database)
    await use(factory)
  },

  prnRepository: async ({ prnRepositoryFactory }, use) => {
    const repository = prnRepositoryFactory()
    await use(repository)
  }
})

describe('MongoDB packaging recycling notes repository', () => {
  describe('packaging recycling notes repository contract', () => {
    testPackagingRecyclingNotesRepositoryContract(it)
  })

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-duplicate key errors from MongoDB', async () => {
      const hexId = '123456789012345678901234'
      const otherError = new Error('Connection timeout')
      otherError.code = 'ETIMEOUT'

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => [],
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
        find: function () {
          return { toArray: async () => [] }
        },
        findOneAndUpdate: async () => {
          throw otherError
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(mockDb)
      const repository = factory()

      await expect(
        repository.updateStatus({
          id: hexId,
          status: 'awaiting_acceptance',
          updatedBy: 'user-123',
          updatedAt: new Date(),
          prnNumber: 'ER2612345'
        })
      ).rejects.toThrow('Connection timeout')
    })

    it('throws PrnNumberConflictError on duplicate key error for prnNumber', async () => {
      const hexId = '123456789012345678901234'
      const prnNumber = 'ER2612345'
      const duplicateKeyError = new Error('duplicate key error')
      duplicateKeyError.code = 11000
      duplicateKeyError.keyPattern = { prnNumber: 1 }

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => [],
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
        find: function () {
          return { toArray: async () => [] }
        },
        findOneAndUpdate: async () => {
          throw duplicateKeyError
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(mockDb)
      const repository = factory()

      await expect(
        repository.updateStatus({
          id: hexId,
          status: 'awaiting_acceptance',
          updatedBy: 'user-123',
          updatedAt: new Date(),
          prnNumber
        })
      ).rejects.toThrow(PrnNumberConflictError)
    })
  })

  describe('ensureCollection index management', () => {
    it('creates unique index on prnNumber when no index exists', async () => {
      const createdIndexes = []

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => [],
        createIndex: async (fields, options) => {
          createdIndexes.push({ fields, options })
        },
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return { toArray: async () => [] }
        }
      }

      await createPackagingRecyclingNotesRepository(mockDb)

      const prnNumberIndex = createdIndexes.find(
        (idx) => idx.options.name === 'prnNumber'
      )
      expect(prnNumberIndex).toBeDefined()
      expect(prnNumberIndex.options.unique).toBe(true)
      expect(prnNumberIndex.options.sparse).toBe(true)
    })

    it('drops and recreates prnNumber index when existing index is not unique', async () => {
      const createdIndexes = []
      let droppedIndex = null

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => [
          { name: 'prnNumber', key: { prnNumber: 1 }, sparse: true }
        ],
        dropIndex: async (indexName) => {
          droppedIndex = indexName
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
        }
      }

      await createPackagingRecyclingNotesRepository(mockDb)

      expect(droppedIndex).toBe('prnNumber')

      const prnNumberIndex = createdIndexes.find(
        (idx) => idx.options.name === 'prnNumber'
      )
      expect(prnNumberIndex).toBeDefined()
      expect(prnNumberIndex.options.unique).toBe(true)
    })

    it('does not drop prnNumber index when already unique', async () => {
      let droppedIndex = null

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => [
          {
            name: 'prnNumber',
            key: { prnNumber: 1 },
            sparse: true,
            unique: true
          }
        ],
        dropIndex: async (indexName) => {
          droppedIndex = indexName
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return { toArray: async () => [] }
        }
      }

      await createPackagingRecyclingNotesRepository(mockDb)

      expect(droppedIndex).toBeNull()
    })

    it('handles ns does not exist error when collection is new', async () => {
      const nsDoesNotExistError = new Error(
        'ns does not exist: epr-backend.l-packaging-recycling-notes'
      )
      nsDoesNotExistError.codeName = 'NamespaceNotFound'

      const createdIndexes = []

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => {
          throw nsDoesNotExistError
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
        }
      }

      await createPackagingRecyclingNotesRepository(mockDb)

      const prnNumberIndex = createdIndexes.find(
        (idx) => idx.options.name === 'prnNumber'
      )
      expect(prnNumberIndex).toBeDefined()
      expect(prnNumberIndex.options.unique).toBe(true)
      expect(prnNumberIndex.options.sparse).toBe(true)
    })

    it('re-throws non-NamespaceNotFound errors from indexes()', async () => {
      const connectionError = new Error('Connection refused')
      connectionError.codeName = 'NetworkError'

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => {
          throw connectionError
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return { toArray: async () => [] }
        }
      }

      await expect(
        createPackagingRecyclingNotesRepository(mockDb)
      ).rejects.toThrow('Connection refused')
    })
  })
})
