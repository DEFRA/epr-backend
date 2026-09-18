import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { it as base } from 'vitest'
import { MongoClient } from 'mongodb'
import { createMarketInsightsExportsRepository } from './mongodb.js'
import { testMarketInsightsExportsRepositoryContract } from './port.contract.js'

/**
 * @import { TestAPI } from 'vitest'
 * @import { MarketInsightsExportsRepository } from './port.js'
 *
 * @typedef {{ mongoClient: MongoClient, marketInsightsExportsRepository: MarketInsightsExportsRepository }} MongoFixtures
 */

const DATABASE_NAME = 'epr-backend'
const COLLECTION_NAME = 'market-insights-exports'

const it = /** @type {TestAPI<MongoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    marketInsightsExportsRepository: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      await database.collection(COLLECTION_NAME).deleteMany({})
      const factory = await createMarketInsightsExportsRepository(database)
      await use(factory())
    }
  })
)

describe('MongoDB market insights exports repository', () => {
  testMarketInsightsExportsRepositoryContract(it)

  base('lets a write failure that is not a lost claim surface', async () => {
    const db = /** @type {any} */ ({
      collection: () => ({
        findOneAndUpdate: async () => {
          throw Object.assign(new Error('not primary'), { code: 10107 })
        }
      })
    })
    const factory = await createMarketInsightsExportsRepository(db)

    // Only a duplicate key means another request holds a current export.
    // Anything else is a genuine failure and must not pass for one.
    await expect(
      factory().claimForBuild({
        year: 2026,
        cadence: 'monthly',
        period: 6,
        now: new Date(),
        abandonedBefore: new Date().toISOString()
      })
    ).rejects.toThrow('not primary')
  })
})
