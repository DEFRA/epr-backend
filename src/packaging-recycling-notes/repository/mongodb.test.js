import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { describe, expect, vi } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { buildAwaitingAuthorisationPrn } from './contract/test-data.js'
import { createPackagingRecyclingNotesRepository } from './mongodb.js'
import { testPackagingRecyclingNotesRepositoryContract } from './port.contract.js'
import { PrnNumberConflictError } from './port.js'

/**
 * @typedef {import('mongodb').Db} Db
 * @typedef {import('#common/helpers/logging/logger.js').TypedLogger} TypedLogger
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('./port.js').PackagingRecyclingNotesRepository} PrnRepository
 */

const DATABASE_NAME = 'epr-backend'

/** Asserts a structural test stub satisfies the Mongo Db surface the code under test exercises. */
const asDb = (/** @type {unknown} */ stub) => /** @type {Db} */ (stub)

/** A complete TypedLogger stub for tests that only execute paths preceding any log call. */
const stubLogger = () =>
  /** @type {TypedLogger} */ ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn()
  })

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  prnRepositoryFactory: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createPackagingRecyclingNotesRepository(database, [])
    await use(factory)
  },

  prnRepository: async (/** @type {*} */ { prnRepositoryFactory }, use) => {
    const repository = prnRepositoryFactory(stubLogger())
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
      const otherError = Object.assign(new Error('Connection timeout'), {
        code: 'ETIMEOUT'
      })

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

      const factory = await createPackagingRecyclingNotesRepository(
        asDb(mockDb),
        []
      )
      const repository = factory(stubLogger())

      await expect(
        repository.updateStatus({
          id: hexId,
          version: 1,
          status: 'awaiting_acceptance',
          updatedBy: { id: 'user-123', name: 'Test User' },
          updatedAt: new Date(),
          prnNumber: 'ER2612345'
        })
      ).rejects.toThrow('Connection timeout')
    })

    it('re-throws non-duplicate key errors from persistProjection', async () => {
      const hexId = '123456789012345678901234'
      const otherError = Object.assign(new Error('Connection timeout'), {
        code: 'ETIMEOUT'
      })

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
        findOneAndReplace: async () => {
          throw otherError
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(
        asDb(mockDb),
        []
      )
      const repository = factory(stubLogger())

      await expect(
        repository.persistProjection({
          projection: /** @type {PackagingRecyclingNote} */ (
            /** @type {unknown} */ ({
              id: hexId,
              version: 2,
              updatedAt: new Date(),
              updatedBy: { id: 'user-123', name: 'Test User' },
              status: {
                currentStatus: 'awaiting_acceptance',
                currentStatusAt: new Date(),
                history: []
              }
            })
          ),
          expectedVersion: 1
        })
      ).rejects.toThrow('Connection timeout')
    })

    it('throws PrnNumberConflictError on duplicate key error for prnNumber', async () => {
      const hexId = '123456789012345678901234'
      const prnNumber = 'ER2612345'
      const duplicateKeyError = Object.assign(
        new Error('duplicate key error'),
        { code: 11000, keyPattern: { prnNumber: 1 } }
      )

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

      const factory = await createPackagingRecyclingNotesRepository(
        asDb(mockDb),
        []
      )
      const repository = factory(stubLogger())

      await expect(
        repository.updateStatus({
          id: hexId,
          version: 1,
          status: 'awaiting_acceptance',
          updatedBy: { id: 'user-123', name: 'Test User' },
          updatedAt: new Date(),
          prnNumber
        })
      ).rejects.toThrow(PrnNumberConflictError)
    })
  })

  describe('ensureOrganisationStatusIndex', () => {
    it('creates organisation.id compound index when no index exists', async () => {
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

      await createPackagingRecyclingNotesRepository(asDb(mockDb), [])

      const orgStatusIndex = createdIndexes.find(
        (idx) => idx.options.name === 'organisationId_status'
      )
      expect(orgStatusIndex).toBeDefined()
      expect(orgStatusIndex.fields).toStrictEqual({
        'organisation.id': 1,
        'status.currentStatus': 1
      })
    })

    it('drops and recreates index when existing index uses v1 organisationId key', async () => {
      const createdIndexes = []
      const droppedIndexes = []

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => [
          {
            name: 'organisationId_status',
            key: { organisationId: 1, 'status.currentStatus': 1 }
          }
        ],
        dropIndex: async (indexName) => {
          droppedIndexes.push(indexName)
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

      await createPackagingRecyclingNotesRepository(asDb(mockDb), [])

      expect(droppedIndexes).toContain('organisationId_status')

      const orgStatusIndex = createdIndexes.find(
        (idx) => idx.options.name === 'organisationId_status'
      )
      expect(orgStatusIndex.fields).toStrictEqual({
        'organisation.id': 1,
        'status.currentStatus': 1
      })
    })

    it('does not drop index when already using v2 organisation.id key', async () => {
      let droppedIndex = null

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => [
          {
            name: 'organisationId_status',
            key: { 'organisation.id': 1, 'status.currentStatus': 1 }
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

      await createPackagingRecyclingNotesRepository(asDb(mockDb), [])

      expect(droppedIndex).toBeNull()
    })

    it('handles NamespaceNotFound error when collection is new', async () => {
      const nsError = Object.assign(new Error('ns not found'), {
        codeName: 'NamespaceNotFound'
      })

      let indexesCalls = 0
      const createdIndexes = []

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => {
          indexesCalls++
          if (indexesCalls === 1) {
            throw nsError
          }
          return []
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

      await createPackagingRecyclingNotesRepository(asDb(mockDb), [])

      const orgStatusIndex = createdIndexes.find(
        (idx) => idx.options.name === 'organisationId_status'
      )
      expect(orgStatusIndex).toBeDefined()
    })

    it('re-throws non-NamespaceNotFound errors', async () => {
      const connectionError = Object.assign(new Error('Connection refused'), {
        codeName: 'NetworkError'
      })

      let indexesCalls = 0

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => {
          indexesCalls++
          if (indexesCalls === 1) {
            throw connectionError
          }
          return []
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
        createPackagingRecyclingNotesRepository(asDb(mockDb), [])
      ).rejects.toThrow('Connection refused')
    })
  })

  describe('ensurePrnNumberIndex error handling', () => {
    it('re-throws non-NamespaceNotFound errors from prnNumber indexes()', async () => {
      const connectionError = Object.assign(new Error('Connection lost'), {
        codeName: 'NetworkError'
      })

      let indexesCalls = 0

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => {
          indexesCalls++
          // First call (org index) succeeds, second call (prnNumber index) fails
          if (indexesCalls === 2) {
            throw connectionError
          }
          return []
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
        createPackagingRecyclingNotesRepository(asDb(mockDb), [])
      ).rejects.toThrow('Connection lost')
    })
  })

  describe('ensureStatusDateIndex', () => {
    it('creates the status_currentStatusAt compound index', async () => {
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

      await createPackagingRecyclingNotesRepository(asDb(mockDb), [])

      const statusDateIndex = createdIndexes.find(
        (idx) => idx.options.name === 'status_currentStatusAt'
      )
      expect(statusDateIndex).toBeDefined()
      expect(statusDateIndex.fields).toStrictEqual({
        'status.currentStatus': 1,
        'status.currentStatusAt': 1,
        _id: 1
      })
    })

    it('handles NamespaceNotFound error when collection does not exist', async () => {
      const nsError = Object.assign(new Error('ns not found'), {
        codeName: 'NamespaceNotFound'
      })

      let createIndexCalls = 0

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => [],
        createIndex: async () => {
          createIndexCalls++
          // Third createIndex call is the status date index
          if (createIndexCalls === 3) {
            throw nsError
          }
        },
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return { toArray: async () => [] }
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(
        asDb(mockDb),
        []
      )
      expect(factory).toBeTypeOf('function')
    })

    it('re-throws non-NamespaceNotFound errors from createIndex', async () => {
      const connectionError = Object.assign(new Error('Connection lost'), {
        codeName: 'NetworkError'
      })

      let createIndexCalls = 0

      const mockDb = {
        collection: function () {
          return this
        },
        indexes: async () => [],
        createIndex: async () => {
          createIndexCalls++
          // Third createIndex call is the status date index
          if (createIndexCalls === 3) {
            throw connectionError
          }
        },
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return { toArray: async () => [] }
        }
      }

      await expect(
        createPackagingRecyclingNotesRepository(asDb(mockDb), [])
      ).rejects.toThrow('Connection lost')
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

      await createPackagingRecyclingNotesRepository(asDb(mockDb), [])

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

      await createPackagingRecyclingNotesRepository(asDb(mockDb), [])

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

      await createPackagingRecyclingNotesRepository(asDb(mockDb), [])

      expect(droppedIndex).toBeNull()
    })

    it('handles ns does not exist error when collection is new', async () => {
      const nsDoesNotExistError = Object.assign(
        new Error('ns does not exist: epr-backend.packaging-recycling-notes'),
        { codeName: 'NamespaceNotFound' }
      )

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

      await createPackagingRecyclingNotesRepository(asDb(mockDb), [])

      const prnNumberIndex = createdIndexes.find(
        (idx) => idx.options.name === 'prnNumber'
      )
      expect(prnNumberIndex).toBeDefined()
      expect(prnNumberIndex.options.unique).toBe(true)
      expect(prnNumberIndex.options.sparse).toBe(true)
    })

    it('re-throws non-NamespaceNotFound errors from indexes()', async () => {
      const connectionError = Object.assign(new Error('Connection refused'), {
        codeName: 'NetworkError'
      })

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
        createPackagingRecyclingNotesRepository(asDb(mockDb), [])
      ).rejects.toThrow('Connection refused')
    })
  })

  describe('legacy documents without a version field', () => {
    const seedVersionlessPrn = async (mongoClient) => {
      const collection = mongoClient
        .db(DATABASE_NAME)
        .collection('packaging-recycling-notes')
      const { version: _version, ...prnWithoutVersion } =
        buildAwaitingAuthorisationPrn()
      const result = await collection.insertOne(prnWithoutVersion)
      return result.insertedId.toHexString()
    }

    it('reads back as version 1', async ({ mongoClient, prnRepository }) => {
      const client = /** @type {MongoClient} */ (mongoClient)
      const repo = /** @type {PrnRepository} */ (prnRepository)

      const id = await seedVersionlessPrn(client)
      const found = await repo.findById(id)

      expect(found?.version).toBe(1)
    })

    it('accepts a CAS update with version 1 and bumps to version 2', async ({
      mongoClient,
      prnRepository
    }) => {
      const client = /** @type {MongoClient} */ (mongoClient)
      const repo = /** @type {PrnRepository} */ (prnRepository)

      const id = await seedVersionlessPrn(client)

      const updated = await repo.updateStatus({
        id,
        version: 1,
        status: PRN_STATUS.AWAITING_ACCEPTANCE,
        updatedBy: { id: 'user-issuer', name: 'Issuer User' },
        updatedAt: new Date(),
        prnNumber: `TT2699999`
      })

      expect(updated?.version).toBe(2)
      expect(updated?.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)

      const reread = await repo.findById(id)
      expect(reread?.version).toBe(2)
    })

    it('reports actual version as 1 when conflict is detected', async ({
      mongoClient,
      prnRepository
    }) => {
      const client = /** @type {MongoClient} */ (mongoClient)
      const repo = /** @type {PrnRepository} */ (prnRepository)
      const id = await seedVersionlessPrn(client)

      const staleVersion = 5
      await expect(
        repo.updateStatus({
          id,
          version: staleVersion,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: { id: 'user-issuer', name: 'Issuer User' },
          updatedAt: new Date()
        })
      ).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 409,
          payload: {
            message: `Version conflict: attempted to update PRN ${id} with version ${staleVersion} but current version is 1`
          }
        }
      })
    })
  })
})
