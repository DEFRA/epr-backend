import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { projectSummaryLogRowState } from '#waste-records/application/project-summary-log-row-state.js'
import { classifyRecordChanges } from '#application/summary-logs/classify-record-changes.js'
import { RECORD_CHANGE } from '#application/summary-logs/record-change.js'
import { buildAccreditation } from '#repositories/organisations/contract/test-data.js'

import {
  createMongoSummaryLogRowStatesRepository,
  ensureSummaryLogRowStatesCollection,
  SUMMARY_LOG_ROW_STATES_COLLECTION_NAME
} from './mongodb.js'
import { testSummaryLogRowStatesRepositoryContract } from './port.contract.js'
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

  summaryLogRowStatesRepository: async (
    /** @type {*} */ { mongoClient },
    use
  ) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database
      .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
      .deleteMany({})
    const factory = await createMongoSummaryLogRowStatesRepository(database)
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
      await createMongoSummaryLogRowStatesRepository(database)
    )()
    expect(repository.upsertSummaryLogRowStates).toBeTypeOf('function')
    expect(repository.findRowStatesForSummaryLog).toBeTypeOf('function')
    expect(repository.findRowHistory).toBeTypeOf('function')
  })

  describe('row-state repository contract', () => {
    testSummaryLogRowStatesRepositoryContract(it)
  })

  describe('concurrent same-ledger writes', () => {
    const CONCURRENT_WRITERS = 20

    it('collapses concurrent identical submissions into a single document with all memberships accreted', async (/** @type {*} */ {
      summaryLogRowStatesRepository
    }) => {
      const repository = summaryLogRowStatesRepository()
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
      summaryLogRowStatesRepository
    }) => {
      const repository = summaryLogRowStatesRepository()
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

      const committed = await repository.findRowStatesForSummaryLog(
        DEFAULT_LEDGER_ID,
        'log-1'
      )
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
        await createMongoSummaryLogRowStatesRepository(
          /** @type {*} */ (stubDb)
        )
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
      await createMongoSummaryLogRowStatesRepository(database)
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

describe('negative-zero classification survives the Mongo round-trip', () => {
  /** @type {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} */
  const overseasSites = {}

  const accreditation = buildAccreditation({
    validFrom: '2024-01-01',
    validTo: '2024-12-31',
    statusHistory: [
      { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
      { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' }
    ]
  })

  // A zero-tonnage sent-on debit projects transactionAmount `-0`. MongoDB does
  // not preserve `-0` (it reads back `+0`), so without normalisation the fresh
  // projection never deep-equals its stored copy and the identical resubmission
  // is reported as an endless phantom adjustment.
  /** @type {import('#domain/waste-records/model.js').WasteRecord} */
  const zeroTonnageSentOn = {
    organisationId: DEFAULT_LEDGER_ID.organisationId,
    registrationId: DEFAULT_LEDGER_ID.registrationId,
    accreditationId: DEFAULT_LEDGER_ID.accreditationId,
    rowId: '5000',
    type: WASTE_RECORD_TYPE.SENT_ON,
    data: {
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
      DATE_LOAD_LEFT_SITE: new Date('2024-06-15'),
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 0
    }
  }

  /** @type {import('#application/waste-records/transform-from-summary-log.js').ValidatedWasteRecord} */
  const currentUpload = {
    record: zeroTonnageSentOn,
    outcome: ROW_OUTCOME.INCLUDED,
    tableName: 'SENT_ON_LOADS',
    wasteRecordType: WASTE_RECORD_TYPE.SENT_ON
  }

  it('classifies an identical zero-tonnage sent-on resubmission as unchanged', async (/** @type {*} */ {
    summaryLogRowStatesRepository
  }) => {
    const repository = summaryLogRowStatesRepository()

    // First submission: project and persist the zero-debit sent-on row.
    const entry = projectSummaryLogRowState(
      zeroTonnageSentOn,
      accreditation,
      overseasSites
    )
    await repository.upsertSummaryLogRowStates(
      DEFAULT_LEDGER_ID,
      [entry],
      'log-1'
    )

    // Read the submitted state back through Mongo, then compare the identical
    // row's fresh projection against it — exactly what a resubmission does.
    const submitted = await repository.findRowStatesForSummaryLog(
      DEFAULT_LEDGER_ID,
      'log-1'
    )
    const submittedRowStatesByKey = new Map(
      submitted.map((doc) => [`${doc.wasteRecordType}:${doc.rowId}`, doc])
    )

    const changes = classifyRecordChanges({
      wasteRecords: [currentUpload],
      submittedRowStatesByKey,
      accreditation,
      overseasSites
    })

    expect(changes.get('sentOn:5000')).toBe(RECORD_CHANGE.UNCHANGED)
  })
})
