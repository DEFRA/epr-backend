import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import {
  createMongoRowStateRepository,
  ensureRowStatesCollection,
  WASTE_BALANCE_ROW_STATES_COLLECTION_NAME
} from './mongodb.js'
import { testRowStateRepositoryContract } from './port.contract.js'
import { buildRowStateEntry, DEFAULT_PARTITION } from './test-data.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  rowStatesCollection: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureRowStatesCollection(database)
    await use(database.collection(WASTE_BALANCE_ROW_STATES_COLLECTION_NAME))
  },

  rowStateRepository: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database
      .collection(WASTE_BALANCE_ROW_STATES_COLLECTION_NAME)
      .deleteMany({})
    const factory = await createMongoRowStateRepository(database)
    await use(factory)
  }
})

const indexKeyFor = (indexes, name) =>
  indexes.find((idx) => idx.name === name)?.key

describe('ensureRowStatesCollection', () => {
  beforeEach(async (/** @type {*} */ { mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(WASTE_BALANCE_ROW_STATES_COLLECTION_NAME)
      .deleteMany({})
  })

  it('creates the membership multikey index', async (/** @type {*} */ {
    rowStatesCollection
  }) => {
    const indexes = await rowStatesCollection.indexes()
    expect(indexKeyFor(indexes, 'membership')).toEqual({ summaryLogIds: 1 })
  })

  it('creates the row-history index', async (/** @type {*} */ {
    rowStatesCollection
  }) => {
    const indexes = await rowStatesCollection.indexes()
    expect(indexKeyFor(indexes, 'row_history')).toEqual({
      organisationId: 1,
      registrationId: 1,
      rowId: 1,
      wasteRecordType: 1
    })
  })

  it('creates a unique committed-state identity index', async (/** @type {*} */ {
    rowStatesCollection
  }) => {
    const indexes = await rowStatesCollection.indexes()
    expect(indexKeyFor(indexes, 'committed_state_identity')).toEqual({
      organisationId: 1,
      registrationId: 1,
      accreditationId: 1,
      rowId: 1,
      wasteRecordType: 1,
      contentHash: 1
    })
    expect(
      indexes.find((idx) => idx.name === 'committed_state_identity')?.unique
    ).toBe(true)
  })

  it('is safe to call multiple times', async (/** @type {*} */ {
    mongoClient
  }) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureRowStatesCollection(database)
    await expect(ensureRowStatesCollection(database)).resolves.toBeDefined()
  })
})

describe('waste record states repository - mongodb implementation', () => {
  it('exposes the row-state port surface', async (/** @type {*} */ {
    mongoClient
  }) => {
    const database = mongoClient.db(DATABASE_NAME)
    const repository = (await createMongoRowStateRepository(database))()
    expect(repository.upsertRowStates).toBeTypeOf('function')
    expect(repository.findBySummaryLogId).toBeTypeOf('function')
    expect(repository.findRowHistory).toBeTypeOf('function')
  })

  describe('row-state repository contract', () => {
    testRowStateRepositoryContract(it)
  })

  describe('concurrent same-partition writes', () => {
    const CONCURRENT_WRITERS = 20

    it('collapses concurrent identical submissions into a single document with all memberships accreted', async (/** @type {*} */ {
      rowStateRepository
    }) => {
      const repository = rowStateRepository()
      const entry = buildRowStateEntry()
      const summaryLogIds = Array.from(
        { length: CONCURRENT_WRITERS },
        (_, i) => `log-${i}`
      )

      await Promise.all(
        summaryLogIds.map((summaryLogId) =>
          repository.upsertRowStates(DEFAULT_PARTITION, [entry], summaryLogId)
        )
      )

      const history = await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
      expect(history).toHaveLength(1)
      expect([...history[0].summaryLogIds].sort()).toEqual(
        [...summaryLogIds].sort()
      )
    })

    it('keeps a concurrently-redelivered submission to a single committed-state row', async (/** @type {*} */ {
      rowStateRepository
    }) => {
      const repository = rowStateRepository()
      const entry = buildRowStateEntry()

      await Promise.all(
        Array.from({ length: CONCURRENT_WRITERS }, () =>
          repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-1')
        )
      )

      const history = await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
      expect(history).toHaveLength(1)
      expect(history[0].summaryLogIds).toEqual(['log-1'])

      const committed = await repository.findBySummaryLogId('log-1')
      expect(committed).toHaveLength(1)
      expect(committed[0].rowId).toBe('row-1')
    })

    it('rethrows a failed insert that is not a committed-state collision', async () => {
      const upstream = new Error('connection lost')
      const stubCollection = {
        createIndex: () => Promise.resolve(),
        findOne: () => Promise.resolve(null),
        insertOne: () => Promise.reject(upstream)
      }
      const stubDb = { collection: () => stubCollection }
      const repository = (
        await createMongoRowStateRepository(/** @type {*} */ (stubDb))
      )()

      await expect(
        repository.upsertRowStates(
          DEFAULT_PARTITION,
          [buildRowStateEntry()],
          'log-1'
        )
      ).rejects.toBe(upstream)
    })
  })
})
