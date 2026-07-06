import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import {
  createMongoLedgerRepository,
  ensureStreamCollection,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from './ledger-mongodb.js'
import { buildStreamEvent } from './ledger-test-data.js'
import { testLedgerRepositoryContract } from './ledger-port.contract.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  streamCollection: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureStreamCollection(database)
    await use(database.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME))
  },

  ledgerRepository: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database
      .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
      .deleteMany({})
    const factory = await createMongoLedgerRepository(database)
    await use(factory)
  }
})

const indexKeyFor = (indexes, name) =>
  indexes.find((idx) => idx.name === name)?.key

const indexOptionFor = (indexes, name, option) =>
  indexes.find((idx) => idx.name === name)?.[option]

describe('ensureStreamCollection', () => {
  beforeEach(async (/** @type {*} */ { mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
      .deleteMany({})
  })

  describe('indexes', () => {
    it('creates the partition_number compound unique index', async (/** @type {*} */ {
      streamCollection
    }) => {
      const indexes = await streamCollection.indexes()
      expect(indexKeyFor(indexes, 'partition_number')).toEqual({
        registrationId: 1,
        accreditationId: 1,
        number: 1
      })
      expect(indexOptionFor(indexes, 'partition_number', 'unique')).toBe(true)
    })

    it('creates the partition_kind_latest index for findLatestInLedgerByKind', async (/** @type {*} */ {
      streamCollection
    }) => {
      const indexes = await streamCollection.indexes()
      expect(indexKeyFor(indexes, 'partition_kind_latest')).toEqual({
        registrationId: 1,
        accreditationId: 1,
        kind: 1,
        number: -1
      })
    })

    it('creates the prn_watermark_catchup index for findEventsByPrnIdAfter', async (/** @type {*} */ {
      streamCollection
    }) => {
      const indexes = await streamCollection.indexes()
      expect(indexKeyFor(indexes, 'prn_watermark_catchup')).toEqual({
        registrationId: 1,
        accreditationId: 1,
        'payload.prnId': 1,
        number: 1
      })
    })
  })

  describe('idempotency', () => {
    it('is safe to call multiple times', async (/** @type {*} */ {
      mongoClient
    }) => {
      const database = mongoClient.db(DATABASE_NAME)
      await ensureStreamCollection(database)
      await expect(ensureStreamCollection(database)).resolves.toBeDefined()
    })
  })
})

describe('MongoDB ledger repository', () => {
  it('exposes the ledger port surface', async (/** @type {*} */ {
    mongoClient
  }) => {
    const database = mongoClient.db(DATABASE_NAME)
    const repository = (await createMongoLedgerRepository(database))()
    expect(repository.appendEvents).toBeTypeOf('function')
    expect(repository.findLatestInLedger).toBeTypeOf('function')
    expect(repository.findLatestInLedgerByKind).toBeTypeOf('function')
    expect(repository.findEventsByPrnIdAfter).toBeTypeOf('function')
    expect(repository.findAllInLedger).toBeTypeOf('function')
  })

  describe('ledger repository contract', () => {
    testLedgerRepositoryContract(it)
  })

  describe('appendEvents error translation', () => {
    it('rethrows non-conflict MongoDB errors unchanged', async () => {
      const upstream = new Error('connection lost')
      const stubCollection = {
        createIndex: () => Promise.resolve(),
        findOne: () => Promise.resolve(null),
        insertMany: () => Promise.reject(upstream)
      }
      const stubDb = { collection: () => stubCollection }

      const repository = (
        await createMongoLedgerRepository(/** @type {*} */ (stubDb))
      )()

      await expect(
        repository.appendEvents([buildStreamEvent({ number: 1 })])
      ).rejects.toBe(upstream)
    })

    it('rethrows E11000 with unrecognised keyPattern as the raw error', async () => {
      const mongoError = Object.assign(new Error('E11000'), {
        code: 11000,
        keyPattern: { unknownField: 1 }
      })
      const stubCollection = {
        createIndex: () => Promise.resolve(),
        findOne: () => Promise.resolve(null),
        insertMany: () => Promise.reject(mongoError)
      }
      const stubDb = { collection: () => stubCollection }

      const repository = (
        await createMongoLedgerRepository(/** @type {*} */ (stubDb))
      )()

      await expect(
        repository.appendEvents([buildStreamEvent({ number: 1 })])
      ).rejects.toBe(mongoError)
    })

    it('classifies a slot conflict raised when inserting the batch', async () => {
      const mongoError = Object.assign(new Error('E11000'), {
        writeErrors: [{ code: 11000, keyPattern: { number: 1 } }]
      })
      const stubCollection = {
        createIndex: () => Promise.resolve(),
        findOne: () => Promise.resolve(null),
        insertMany: () => Promise.reject(mongoError)
      }
      const stubDb = { collection: () => stubCollection }

      const repository = (
        await createMongoLedgerRepository(/** @type {*} */ (stubDb))
      )()

      await expect(
        repository.appendEvents([buildStreamEvent({ number: 1 })])
      ).rejects.toMatchObject({
        name: 'LedgerSlotConflictError'
      })
    })
  })
})
