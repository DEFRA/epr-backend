import { describe, beforeEach, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteBalancesRepository } from './repository.js'
import {
  createMongoStreamRepository,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from './stream-mongodb.js'
import { buildStreamEvent } from './stream-test-data.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn()
  }
}))

const DATABASE_NAME = 'epr-backend'

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

  wasteBalancesRepository: async ({ streamRepository }, use) => {
    const factory = createWasteBalancesRepository({
      streamRepository:
        /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
          /** @type {unknown} */ (streamRepository)
        )
    })
    await use(factory)
  },

  seedBalance: async ({ streamRepository }, use) => {
    await use(async (event) => {
      await /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
        /** @type {unknown} */ (streamRepository)
      ).appendEvent(buildStreamEvent(event))
    })
  }
})

describe('MongoDB waste balances repository', () => {
  describe('repository creation', () => {
    it('should create repository instance', async ({ streamRepository }) => {
      const repository = createWasteBalancesRepository({
        streamRepository:
          /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
            /** @type {unknown} */ (streamRepository)
          )
      })
      const instance = repository()
      expect(instance).toBeDefined()
      expect(instance.findBalance).toBeTypeOf('function')
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
