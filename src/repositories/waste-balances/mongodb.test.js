import { describe, beforeEach, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteBalancesRepository } from './mongodb.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'

const DATABASE_NAME = 'epr-backend'
const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  // eslint-disable-next-line no-empty-pattern
  organisationsRepository: async ({}, use) => {
    const mock = {
      getAccreditationById: vi.fn()
    }
    await use(mock)
  },

  wasteBalancesRepository: async (
    { mongoClient, organisationsRepository },
    use
  ) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = createWasteBalancesRepository(database, {
      organisationsRepository
    })
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
      const repository = createWasteBalancesRepository(database)
      const instance = repository()
      expect(instance).toBeDefined()
      expect(instance.findByAccreditationId).toBeTypeOf('function')
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
