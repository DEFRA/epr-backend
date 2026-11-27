import { MongoClient } from 'mongodb'
import { describe, expect } from 'vitest'

import { EXTERNAL_ACCREDITATIONS_COLLECTION_NAME } from '../collection.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { createMongoExternalAccreditationsRepository } from './mongodb.js'
import { testExternalAccreditationsRepositoryContract } from './port.contract.js'

/** @import { Db } from 'mongodb' */
/** @import { TestAPI } from 'vitest' */
/** @import { ExternalAccreditationsRepository } from './port.js' */

/**
 * @typedef {{
 *   database: Db
 *   externalAccreditationsRepository: ExternalAccreditationsRepository
 *   held: () => Promise<object[]>
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
        .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
        .deleteMany({})
      await use(database)
    },

    externalAccreditationsRepository: async (
      /** @type {{ database: Db }} */ { database },
      use
    ) => {
      const factory =
        await createMongoExternalAccreditationsRepository(database)
      await use(factory())
    },

    held: async (/** @type {{ database: Db }} */ { database }, use) => {
      await use(() =>
        database
          .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
          .find({}, { projection: { _id: 0 } })
          .sort({ registrationNumber: 1, year: 1 })
          .toArray()
      )
    }
  })
)

describe('mongodb external accreditations repository', () => {
  testExternalAccreditationsRepositoryContract(it)

  it('holds one accreditation per organisation, registration and year', async ({
    database
  }) => {
    await createMongoExternalAccreditationsRepository(database)

    const indexes = await database
      .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
      .indexes()

    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { organisationNumber: 1, registrationNumber: 1, year: 1 },
        unique: true
      })
    )
  })

  it('drops the registration and year index it replaces', async ({
    database
  }) => {
    const collection = database.collection(
      EXTERNAL_ACCREDITATIONS_COLLECTION_NAME
    )
    await collection.createIndex(
      { registrationNumber: 1, year: 1 },
      { name: 'registration_year', unique: true }
    )

    await createMongoExternalAccreditationsRepository(database)

    const names = (await collection.indexes()).map(({ name }) => name)
    expect(names).not.toContain('registration_year')
  })
})
