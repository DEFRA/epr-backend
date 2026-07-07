import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import {
  createMongoSummaryLogRowStatesBackfillWatermarkRepository,
  ensureSummaryLogRowStatesBackfillWatermarksCollection,
  SUMMARY_LOG_ROW_STATES_BACKFILL_WATERMARKS_COLLECTION_NAME
} from './mongodb.js'
import { testSummaryLogRowStatesBackfillWatermarkRepositoryContract } from './port.contract.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  watermarksCollection: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureSummaryLogRowStatesBackfillWatermarksCollection(database)
    await use(
      database.collection(
        SUMMARY_LOG_ROW_STATES_BACKFILL_WATERMARKS_COLLECTION_NAME
      )
    )
  },

  watermarkRepository: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database
      .collection(SUMMARY_LOG_ROW_STATES_BACKFILL_WATERMARKS_COLLECTION_NAME)
      .deleteMany({})
    const factory =
      await createMongoSummaryLogRowStatesBackfillWatermarkRepository(database)
    await use(factory)
  }
})

const indexKeyFor = (indexes, name) =>
  indexes.find((idx) => idx.name === name)?.key

describe('ensureSummaryLogRowStatesBackfillWatermarksCollection', () => {
  beforeEach(async (/** @type {*} */ { mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(SUMMARY_LOG_ROW_STATES_BACKFILL_WATERMARKS_COLLECTION_NAME)
      .deleteMany({})
  })

  it('creates a unique registration-identity index', async (/** @type {*} */ {
    watermarksCollection
  }) => {
    const indexes = await watermarksCollection.indexes()
    expect(indexKeyFor(indexes, 'registration_identity')).toEqual({
      organisationId: 1,
      registrationId: 1
    })
    expect(
      indexes.find((idx) => idx.name === 'registration_identity')?.unique
    ).toBe(true)
  })

  it('is safe to call multiple times', async (/** @type {*} */ {
    mongoClient
  }) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureSummaryLogRowStatesBackfillWatermarksCollection(database)
    await expect(
      ensureSummaryLogRowStatesBackfillWatermarksCollection(database)
    ).resolves.toBeDefined()
  })
})

describe('summary-log-row-states backfill watermark - mongodb implementation', () => {
  it('exposes the watermark port surface', async (/** @type {*} */ {
    mongoClient
  }) => {
    const database = mongoClient.db(DATABASE_NAME)
    const repository = (
      await createMongoSummaryLogRowStatesBackfillWatermarkRepository(database)
    )()
    expect(repository.read).toBeTypeOf('function')
    expect(repository.advance).toBeTypeOf('function')
  })

  describe('watermark repository contract', () => {
    testSummaryLogRowStatesBackfillWatermarkRepositoryContract(it)
  })
})
