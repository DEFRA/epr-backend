import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteBalancesRepository } from './repository.js'
import {
  createMongoStreamRepository,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from './stream-mongodb.js'
import {
  createMongoRowStateRepository,
  WASTE_BALANCE_ROW_STATES_COLLECTION_NAME
} from './row-states-mongodb.js'
import { buildStreamEvent } from './stream-test-data.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn()
  }
}))

const DATABASE_NAME = 'epr-backend'

/**
 * @typedef {object} WasteBalancesRepoFixtures
 * @property {import('mongodb').MongoClient} mongoClient
 * @property {import('./stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @property {import('./row-states-port.js').RowStateRepository} rowStateRepository
 * @property {import('./port.js').WasteBalancesRepositoryFactory} wasteBalancesRepository
 * @property {(event: object) => Promise<void>} seedBalance
 */

const it = /** @type {import('vitest').TestAPI<WasteBalancesRepoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    streamRepository: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      const factory = await createMongoStreamRepository(database)
      await use(factory())
    },

    rowStateRepository: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      const factory = await createMongoRowStateRepository(database)
      await use(factory())
    },

    wasteBalancesRepository: async (
      { streamRepository, rowStateRepository },
      use
    ) => {
      const factory = createWasteBalancesRepository({
        streamRepository,
        rowStateRepository
      })
      await use(factory)
    },

    seedBalance: async ({ streamRepository }, use) => {
      await use(async (event) => {
        await streamRepository.appendEvent(buildStreamEvent(event))
      })
    }
  })
)

describe('MongoDB waste balances repository', () => {
  describe('repository creation', () => {
    it('should create repository instance', async ({ streamRepository }) => {
      const repository = createWasteBalancesRepository({ streamRepository })
      const instance = repository()
      expect(instance).toBeDefined()
      expect(instance.findBalance).toBeTypeOf('function')
    })
  })

  describe('data management', () => {
    it.beforeEach(async ({ mongoClient }) => {
      const database = mongoClient.db(DATABASE_NAME)
      await database
        .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
        .deleteMany({})
      await database
        .collection(WASTE_BALANCE_ROW_STATES_COLLECTION_NAME)
        .deleteMany({})
    })

    describe('waste balances repository contract', () => {
      testWasteBalancesRepositoryContract(it)
    })
  })
})
