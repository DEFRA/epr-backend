import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteBalancesRepository } from './mongodb.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'
import { WASTE_BALANCE_LEDGER_COLLECTION_NAME } from './ledger-mongodb.js'

const DATABASE_NAME = 'epr-backend'
const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  wasteBalancesRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createWasteBalancesRepository(database)
    await use(factory)
  },

  insertWasteBalance: async ({ mongoClient }, use) => {
    await use(async (wasteBalance) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection(WASTE_BALANCE_COLLECTION_NAME)
        .insertOne(wasteBalance)
    })
  },

  insertWasteBalances: async ({ mongoClient }, use) => {
    await use(async (wasteBalances) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection(WASTE_BALANCE_COLLECTION_NAME)
        .insertMany(wasteBalances)
    })
  }
})

describe('MongoDB waste balances repository', () => {
  describe('repository creation', () => {
    it('should create repository instance', async ({ mongoClient }) => {
      const database = mongoClient.db(DATABASE_NAME)
      const repository = await createWasteBalancesRepository(database)
      const instance = repository()
      expect(instance).toBeDefined()
      expect(instance.findByAccreditationId).toBeTypeOf('function')
    })

    it('ensures the ledger collection indexes exist', async ({
      mongoClient
    }) => {
      const database = mongoClient.db(DATABASE_NAME)
      await createWasteBalancesRepository(database)

      const indexes = await database
        .collection(WASTE_BALANCE_LEDGER_COLLECTION_NAME)
        .indexes()
      const names = indexes.map((idx) => idx.name)
      expect(names).toContain('accreditationId_number')
      expect(names).toContain('summaryLogRow_wasteRecord_findLatest')
      expect(names).toContain('summaryLogRow_row')
      expect(names).toContain('prnOperation_prnId')
    })
  })

  describe('data management', () => {
    beforeEach(async ({ mongoClient }) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection(WASTE_BALANCE_COLLECTION_NAME)
        .deleteMany({})
    })

    describe('waste balances repository contract', () => {
      testWasteBalancesRepositoryContract(it)
    })
  })
})
