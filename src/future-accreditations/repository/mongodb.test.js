import { MongoClient } from 'mongodb'
import { describe, expect } from 'vitest'

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import {
  FUTURE_ACCREDITATIONS_COLLECTION_NAME,
  createMongoFutureAccreditationsRepository
} from './mongodb.js'
import { testFutureAccreditationsRepositoryContract } from './port.contract.js'

/** @import { Db } from 'mongodb' */
/** @import { TestAPI } from 'vitest' */
/** @import { FutureAccreditationsRepository } from './port.js' */
/** @import { FutureAccreditationsContractIt } from './port.contract.js' */

/**
 * @typedef {{
 *   database: Db
 *   futureAccreditationsRepository: FutureAccreditationsRepository
 *   mongoClient: MongoClient
 * }} MongoFixtures
 */

const DATABASE_NAME = 'epr-backend'

const it = /** @type {TestAPI<MongoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    database: async (
      /** @type {{ mongoClient: MongoClient }} */ { mongoClient },
      use
    ) => {
      const database = mongoClient.db(DATABASE_NAME)
      await database
        .collection(FUTURE_ACCREDITATIONS_COLLECTION_NAME)
        .deleteMany({})
      await use(database)
    },

    futureAccreditationsRepository: async (
      /** @type {{ database: Db }} */ { database },
      use
    ) => {
      const factory = await createMongoFutureAccreditationsRepository(database)
      await use(factory())
    }
  })
)

describe('mongodb future accreditations repository', () => {
  testFutureAccreditationsRepositoryContract(
    /** @type {FutureAccreditationsContractIt} */ (/** @type {unknown} */ (it))
  )

  it('should hold one accreditation per registration and year', async ({
    database
  }) => {
    await createMongoFutureAccreditationsRepository(database)

    const indexes = await database
      .collection(FUTURE_ACCREDITATIONS_COLLECTION_NAME)
      .indexes()

    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { registrationNumber: 1, year: 1 },
        unique: true
      })
    )
  })
})
