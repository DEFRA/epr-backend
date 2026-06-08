import { describe, beforeEach, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteBalancesRepository } from './mongodb.js'
import {
  createMongoStreamRepository,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from './stream-mongodb.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn()
  }
}))

const DATABASE_NAME = 'epr-backend'
const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(
      // db is typed as the fixture tuple by TypeScript; the yielded value is a string (mongo URI)
      /** @type {string} */ (/** @type {unknown} */ (db))
    )
    await use(client)
    await client.close()
  },

  streamRepository: async ({ mongoClient }, use) => {
    const database = /** @type {import('mongodb').MongoClient} */ (
      mongoClient
    ).db(DATABASE_NAME)
    const factory = await createMongoStreamRepository(database)
    await use(factory())
  },

  wasteBalancesRepository: async ({ mongoClient, streamRepository }, use) => {
    const database = /** @type {import('mongodb').MongoClient} */ (
      mongoClient
    ).db(DATABASE_NAME)
    const factory = await createWasteBalancesRepository(database, {
      streamRepository:
        /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
          /** @type {unknown} */ (streamRepository)
        )
    })
    await use(factory)
  },

  insertWasteBalance: async ({ mongoClient }, use) => {
    await use(async (wasteBalance) => {
      await /** @type {import('mongodb').MongoClient} */ (mongoClient)
        .db(DATABASE_NAME)
        .collection(WASTE_BALANCE_COLLECTION_NAME)
        .insertOne(wasteBalance)
    })
  },

  insertWasteBalances: async ({ mongoClient }, use) => {
    await use(async (wasteBalances) => {
      await /** @type {import('mongodb').MongoClient} */ (mongoClient)
        .db(DATABASE_NAME)
        .collection(WASTE_BALANCE_COLLECTION_NAME)
        .insertMany(wasteBalances)
    })
  }
})

describe('MongoDB waste balances repository', () => {
  describe('repository creation', () => {
    it('should create repository instance', async ({
      mongoClient,
      streamRepository
    }) => {
      const database = /** @type {import('mongodb').MongoClient} */ (
        mongoClient
      ).db(DATABASE_NAME)
      const repository = await createWasteBalancesRepository(database, {
        streamRepository:
          /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
            /** @type {unknown} */ (streamRepository)
          )
      })
      const instance = repository()
      expect(instance).toBeDefined()
      expect(instance.findByAccreditationId).toBeTypeOf('function')
    })
  })

  describe('data management', () => {
    beforeEach(
      async (
        // @ts-expect-error -- vitest .extend() fixture typing
        { mongoClient }
      ) => {
        const database = /** @type {import('mongodb').MongoClient} */ (
          mongoClient
        ).db(DATABASE_NAME)
        await database.collection(WASTE_BALANCE_COLLECTION_NAME).deleteMany({})
        await database
          .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
          .deleteMany({})
      }
    )

    describe('waste balances repository contract', () => {
      testWasteBalancesRepositoryContract(it)
    })
  })
})
