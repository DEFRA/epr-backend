import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import {
  createMongoRowStateRepository,
  ensureRowStatesCollection,
  WASTE_BALANCE_ROW_STATES_COLLECTION_NAME
} from './row-states-mongodb.js'
import { testRowStateRepositoryContract } from './row-states-port.contract.js'

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

  it('is safe to call multiple times', async (/** @type {*} */ {
    mongoClient
  }) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureRowStatesCollection(database)
    await expect(ensureRowStatesCollection(database)).resolves.toBeDefined()
  })
})

describe('committed row-states repository - mongodb implementation', () => {
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
})
