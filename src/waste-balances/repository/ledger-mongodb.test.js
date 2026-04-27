import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import {
  createMongoLedgerRepository,
  ensureLedgerCollection,
  WASTE_BALANCE_LEDGER_COLLECTION_NAME
} from './ledger-mongodb.js'
import { buildLedgerTransaction } from './ledger-test-data.js'
import { testLedgerRepositoryContract } from './ledger-port.contract.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  ledgerCollection: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureLedgerCollection(database)
    await use(database.collection(WASTE_BALANCE_LEDGER_COLLECTION_NAME))
  },

  ledgerRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database
      .collection(WASTE_BALANCE_LEDGER_COLLECTION_NAME)
      .deleteMany({})
    const factory = await createMongoLedgerRepository(database)
    await use(factory)
  }
})

const indexKeyFor = (indexes, name) =>
  indexes.find((idx) => idx.name === name)?.key

const indexOptionFor = (indexes, name, option) =>
  indexes.find((idx) => idx.name === name)?.[option]

describe('ensureLedgerCollection', () => {
  beforeEach(async ({ mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(WASTE_BALANCE_LEDGER_COLLECTION_NAME)
      .deleteMany({})
  })

  describe('indexes', () => {
    it('creates the accreditationId_number compound unique index', async ({
      ledgerCollection
    }) => {
      const indexes = await ledgerCollection.indexes()
      expect(indexKeyFor(indexes, 'accreditationId_number')).toEqual({
        accreditationId: 1,
        number: 1
      })
      expect(indexOptionFor(indexes, 'accreditationId_number', 'unique')).toBe(
        true
      )
    })

    it('creates the summaryLogRow_wasteRecordId index', async ({
      ledgerCollection
    }) => {
      const indexes = await ledgerCollection.indexes()
      expect(indexKeyFor(indexes, 'summaryLogRow_wasteRecordId')).toEqual({
        'source.summaryLogRow.wasteRecordId': 1
      })
    })

    it('creates the summaryLogRow_row compound index', async ({
      ledgerCollection
    }) => {
      const indexes = await ledgerCollection.indexes()
      expect(indexKeyFor(indexes, 'summaryLogRow_row')).toEqual({
        'source.summaryLogRow.summaryLogId': 1,
        'source.summaryLogRow.rowId': 1,
        'source.summaryLogRow.rowType': 1
      })
    })

    it('creates the prnOperation_prnId index', async ({ ledgerCollection }) => {
      const indexes = await ledgerCollection.indexes()
      expect(indexKeyFor(indexes, 'prnOperation_prnId')).toEqual({
        'source.prnOperation.prnId': 1
      })
    })
  })

  describe('unique constraint on (accreditationId, number)', () => {
    it('allows distinct numbers for the same accreditation', async ({
      ledgerCollection
    }) => {
      await ledgerCollection.insertOne(buildLedgerTransaction({ number: 1 }))
      await expect(
        ledgerCollection.insertOne(buildLedgerTransaction({ number: 2 }))
      ).resolves.toBeDefined()
    })

    it('allows the same number across different accreditations', async ({
      ledgerCollection
    }) => {
      await ledgerCollection.insertOne(
        buildLedgerTransaction({ accreditationId: 'acc-1', number: 1 })
      )
      await expect(
        ledgerCollection.insertOne(
          buildLedgerTransaction({ accreditationId: 'acc-2', number: 1 })
        )
      ).resolves.toBeDefined()
    })

    it('rejects duplicate (accreditationId, number)', async ({
      ledgerCollection
    }) => {
      await ledgerCollection.insertOne(
        buildLedgerTransaction({ accreditationId: 'acc-1', number: 1 })
      )
      await expect(
        ledgerCollection.insertOne(
          buildLedgerTransaction({ accreditationId: 'acc-1', number: 1 })
        )
      ).rejects.toThrow(/duplicate key/i)
    })
  })

  describe('idempotency', () => {
    it('is safe to call multiple times', async ({ mongoClient }) => {
      const database = mongoClient.db(DATABASE_NAME)
      await ensureLedgerCollection(database)
      await expect(ensureLedgerCollection(database)).resolves.toBeDefined()
    })
  })
})

describe('MongoDB ledger repository', () => {
  it('exposes the ledger port surface', async ({ mongoClient }) => {
    const database = mongoClient.db(DATABASE_NAME)
    const repository = (await createMongoLedgerRepository(database))()
    expect(repository.insertTransaction).toBeTypeOf('function')
    expect(repository.findLatestByAccreditationId).toBeTypeOf('function')
  })

  describe('ledger repository contract', () => {
    testLedgerRepositoryContract(it)
  })

  describe('insertTransaction error translation', () => {
    it('rethrows non-conflict MongoDB errors unchanged', async () => {
      const upstream = new Error('connection lost')
      const stubCollection = {
        createIndex: () => Promise.resolve(),
        insertOne: () => Promise.reject(upstream)
      }
      const stubDb = { collection: () => stubCollection }

      const repository = (
        await createMongoLedgerRepository(/** @type {*} */ (stubDb))
      )()

      await expect(
        repository.insertTransaction(buildLedgerTransaction({ number: 1 }))
      ).rejects.toBe(upstream)
    })
  })
})
