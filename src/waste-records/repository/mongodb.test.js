import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import {
  createMongoSummaryLogRowStateRepository,
  ensureSummaryLogRowStatesCollection,
  SUMMARY_LOG_ROW_STATES_COLLECTION_NAME
} from './mongodb.js'
import { testSummaryLogRowStateRepositoryContract } from './port.contract.js'
import { buildSummaryLogRowStateEntry, DEFAULT_LEDGER_ID } from './test-data.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  monitoredClient: async (/** @type {*} */ { db }, use) => {
    const client = new MongoClient(db, { monitorCommands: true })
    await client.connect()
    await use(client)
    await client.close()
  },

  summaryLogRowStatesCollection: async (
    /** @type {*} */ { mongoClient },
    use
  ) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureSummaryLogRowStatesCollection(database)
    await use(database.collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME))
  },

  summaryLogRowStateRepository: async (
    /** @type {*} */ { mongoClient },
    use
  ) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database
      .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
      .deleteMany({})
    const factory = await createMongoSummaryLogRowStateRepository(database)
    await use(factory)
  }
})

const indexKeyFor = (indexes, name) =>
  indexes.find((idx) => idx.name === name)?.key

describe('ensureSummaryLogRowStatesCollection', () => {
  beforeEach(async (/** @type {*} */ { mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
      .deleteMany({})
  })

  it('creates the membership multikey index', async (/** @type {*} */ {
    summaryLogRowStatesCollection
  }) => {
    const indexes = await summaryLogRowStatesCollection.indexes()
    expect(indexKeyFor(indexes, 'summary_log_membership')).toEqual({
      summaryLogIds: 1
    })
  })

  it('creates the row-history index', async (/** @type {*} */ {
    summaryLogRowStatesCollection
  }) => {
    const indexes = await summaryLogRowStatesCollection.indexes()
    expect(indexKeyFor(indexes, 'row_history')).toEqual({
      organisationId: 1,
      registrationId: 1,
      rowId: 1,
      wasteRecordType: 1
    })
  })

  it('creates a unique summary-log-row-state identity index', async (/** @type {*} */ {
    summaryLogRowStatesCollection
  }) => {
    const indexes = await summaryLogRowStatesCollection.indexes()
    expect(indexKeyFor(indexes, 'summary_log_row_state_identity')).toEqual({
      organisationId: 1,
      registrationId: 1,
      accreditationId: 1,
      rowId: 1,
      wasteRecordType: 1,
      contentHash: 1
    })
    expect(
      indexes.find((idx) => idx.name === 'summary_log_row_state_identity')
        ?.unique
    ).toBe(true)
  })

  it('is safe to call multiple times', async (/** @type {*} */ {
    mongoClient
  }) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureSummaryLogRowStatesCollection(database)
    await expect(
      ensureSummaryLogRowStatesCollection(database)
    ).resolves.toBeDefined()
  })
})

describe('summary-log row states repository - mongodb implementation', () => {
  it('exposes the row-state port surface', async (/** @type {*} */ {
    mongoClient
  }) => {
    const database = mongoClient.db(DATABASE_NAME)
    const repository = (
      await createMongoSummaryLogRowStateRepository(database)
    )()
    expect(repository.upsertSummaryLogRowStates).toBeTypeOf('function')
    expect(repository.findBySummaryLogId).toBeTypeOf('function')
    expect(repository.findRowHistory).toBeTypeOf('function')
  })

  describe('row-state repository contract', () => {
    testSummaryLogRowStateRepositoryContract(it)
  })

  describe('concurrent same-ledger writes', () => {
    const CONCURRENT_WRITERS = 20

    it('collapses concurrent identical submissions into a single document with all memberships accreted', async (/** @type {*} */ {
      summaryLogRowStateRepository
    }) => {
      const repository = summaryLogRowStateRepository()
      const entry = buildSummaryLogRowStateEntry()
      const summaryLogIds = Array.from(
        { length: CONCURRENT_WRITERS },
        (_, i) => `log-${i}`
      )

      await Promise.all(
        summaryLogIds.map((summaryLogId) =>
          repository.upsertSummaryLogRowStates(
            DEFAULT_LEDGER_ID,
            [entry],
            summaryLogId
          )
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

    it('keeps a concurrently-redelivered submission to a single summary-log-row-state row', async (/** @type {*} */ {
      summaryLogRowStateRepository
    }) => {
      const repository = summaryLogRowStateRepository()
      const entry = buildSummaryLogRowStateEntry()

      await Promise.all(
        Array.from({ length: CONCURRENT_WRITERS }, () =>
          repository.upsertSummaryLogRowStates(
            DEFAULT_LEDGER_ID,
            [entry],
            'log-1'
          )
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

    it('rethrows a failed write that is not a summary-log-row-state collision', async () => {
      const upstream = new Error('connection lost')
      const stubCollection = {
        createIndex: () => Promise.resolve(),
        bulkWrite: () => Promise.reject(upstream),
        find: () => ({ toArray: () => Promise.resolve([]) })
      }
      const stubDb = { collection: () => stubCollection }
      const repository = (
        await createMongoSummaryLogRowStateRepository(/** @type {*} */ (stubDb))
      )()

      await expect(
        repository.upsertSummaryLogRowStates(
          DEFAULT_LEDGER_ID,
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )
      ).rejects.toBe(upstream)
    })
  })
})

describe('write round-trip count', () => {
  const countCommands = async (monitoredClient, run) => {
    let commands = 0
    const onCommand = () => {
      commands += 1
    }
    monitoredClient.on('commandStarted', onCommand)
    await run()
    monitoredClient.off('commandStarted', onCommand)
    return commands
  }

  it('issues a row-count-independent number of write round trips', async (/** @type {*} */ {
    monitoredClient
  }) => {
    const database = monitoredClient.db(DATABASE_NAME)
    await ensureSummaryLogRowStatesCollection(database)
    const collection = database.collection(
      SUMMARY_LOG_ROW_STATES_COLLECTION_NAME
    )
    const repository = (
      await createMongoSummaryLogRowStateRepository(database)
    )()

    const roundTripsFor = async (rowCount, summaryLogId) => {
      await collection.deleteMany({})
      const entries = Array.from({ length: rowCount }, (_, i) =>
        buildSummaryLogRowStateEntry({ rowId: `row-${i}` })
      )
      return countCommands(monitoredClient, () =>
        repository.upsertSummaryLogRowStates(
          DEFAULT_LEDGER_ID,
          entries,
          summaryLogId
        )
      )
    }

    const forOneRow = await roundTripsFor(1, 'log-1')
    const forFiftyRows = await roundTripsFor(50, 'log-50')

    expect(forFiftyRows).toBe(forOneRow)
  })
})
