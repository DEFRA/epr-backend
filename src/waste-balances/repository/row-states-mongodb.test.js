import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import {
  createMongoRowStateRepository,
  ensureRowStatesCollection,
  WASTE_BALANCE_ROW_STATES_COLLECTION_NAME
} from './row-states-mongodb.js'
import {
  buildRowStateEntry,
  DEFAULT_PARTITION
} from './row-states-test-data.js'

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
})

describe('committed row-states repository - mongodb implementation', () => {
  it('inserts a new state document and finds it by submission', async (/** @type {*} */ {
    rowStateRepository
  }) => {
    const repository = rowStateRepository()

    const [state] = await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry()],
      'log-1'
    )

    expect(state.id).toBeTypeOf('string')
    expect(state.summaryLogIds).toEqual(['log-1'])

    const committed = await repository.findBySummaryLogId('log-1')
    expect(committed).toHaveLength(1)
    expect(committed[0].rowId).toBe('row-1')
  })

  it('grows membership when an unchanged row recommits', async (/** @type {*} */ {
    rowStateRepository
  }) => {
    const repository = rowStateRepository()
    const entry = buildRowStateEntry()

    await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-1')
    const [state] = await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [entry],
      'log-2'
    )

    expect(state.summaryLogIds).toEqual(['log-1', 'log-2'])
    expect(
      await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
    ).toHaveLength(1)
  })

  it('inserts a new document when a row changes', async (/** @type {*} */ {
    rowStateRepository
  }) => {
    const repository = rowStateRepository()

    await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ data: { tonnage: 10 } })],
      'log-1'
    )
    await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [
        buildRowStateEntry({
          data: { tonnage: 20 },
          classification: {
            outcome: ROW_OUTCOME.EXCLUDED,
            reasons: [{ code: 'MISSING_REQUIRED_FIELD', field: 'tonnage' }],
            transactionAmount: 0
          }
        })
      ],
      'log-2'
    )

    const history = await repository.findRowHistory(
      'org-1',
      'reg-1',
      'row-1',
      WASTE_RECORD_TYPE.RECEIVED
    )
    expect(history).toHaveLength(2)
    expect(history.map((s) => s.data.tonnage)).toEqual([10, 20])
  })

  it('is idempotent on a repeated submission', async (/** @type {*} */ {
    rowStateRepository
  }) => {
    const repository = rowStateRepository()
    const entry = buildRowStateEntry()

    await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-1')
    const [state] = await repository.upsertRowStates(
      DEFAULT_PARTITION,
      [entry],
      'log-1'
    )

    expect(state.summaryLogIds).toEqual(['log-1'])
    expect(
      await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
    ).toHaveLength(1)
  })

  it('stores a registered-only state with a null accreditationId', async (/** @type {*} */ {
    rowStateRepository
  }) => {
    const repository = rowStateRepository()

    const [state] = await repository.upsertRowStates(
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: null
      },
      [buildRowStateEntry()],
      'log-1'
    )

    expect(state.accreditationId).toBeNull()
    const committed = await repository.findBySummaryLogId('log-1')
    expect(committed[0].accreditationId).toBeNull()
  })
})
