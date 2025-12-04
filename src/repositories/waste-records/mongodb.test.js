import { describe, beforeEach } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteRecordsRepository } from './mongodb.js'
import { testWasteRecordsRepositoryContract } from './port.contract.js'

const DATABASE_NAME = 'epr-backend'
const COLLECTION_NAME = 'waste-records'
const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  wasteRecordsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = createWasteRecordsRepository(database)
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

describe('MongoDB waste records repository', () => {
  beforeEach(async ({ mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(COLLECTION_NAME)
      .deleteMany({})
    await mongoClient
      .db(DATABASE_NAME)
      .collection(WASTE_BALANCE_COLLECTION_NAME)
      .deleteMany({})
  })

  describe('waste records repository contract', () => {
    testWasteRecordsRepositoryContract(it)
  })
})
