import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { beforeEach, describe } from 'vitest'
import { COLLECTION_NAME } from '#repositories/organisations/mongodb-find.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createRegistrationAccreditationAdminRepository } from './mongodb.js'
import { testRegistrationAccreditationAdminRepositoryContract } from './port.contract.js'

/**
 * @import { OrganisationsRepositoryFactory } from '#repositories/organisations/port.js'
 * @typedef {{ mongoClient: MongoClient, organisationsRepository: OrganisationsRepositoryFactory }} MongoFixtures
 */

const DATABASE_NAME = 'epr-backend'

const it = /** @type {import('vitest').TestAPI<MongoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    organisationsRepository: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      const organisations = await createOrganisationsRepository(database)
      const admin = createRegistrationAccreditationAdminRepository(database)
      await use(() => ({ ...organisations(), ...admin() }))
    }
  })
)

describe('MongoDB registration and accreditation admin repository', () => {
  beforeEach(
    /** @param {MongoFixtures} fixture */ async ({ mongoClient }) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection(COLLECTION_NAME)
        .deleteMany({})
    }
  )

  testRegistrationAccreditationAdminRepositoryContract(it)
})
