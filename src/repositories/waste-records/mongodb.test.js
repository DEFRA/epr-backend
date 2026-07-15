import { describe, beforeEach } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteRecordsRepository } from './mongodb.js'
import { testWasteRecordsRepositoryContract } from './port.contract.js'

/**
 * @import { TestAPI } from 'vitest'
 * @import { WasteRecordsRepositoryFactory } from './port.js'
 *
 * @typedef {{ mongoClient: MongoClient, wasteRecordsRepository: WasteRecordsRepositoryFactory }} MongoFixtures
 */

const DATABASE_NAME = 'epr-backend'
const COLLECTION_NAME = 'waste-records'

const it = /** @type {TestAPI<MongoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    wasteRecordsRepository: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      const factory = await createWasteRecordsRepository(database)
      await use(factory)
    }
  })
)

describe('MongoDB waste records repository', () => {
  beforeEach(
    /** @param {MongoFixtures} fixture */ async ({ mongoClient }) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection(COLLECTION_NAME)
        .deleteMany({})
    }
  )

  describe('waste records repository contract', () => {
    testWasteRecordsRepositoryContract(it)
  })
})
