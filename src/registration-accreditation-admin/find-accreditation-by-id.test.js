import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { beforeEach, describe, it as base } from 'vitest'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { COLLECTION_NAME } from '#repositories/organisations/mongodb-find.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { testFindAccreditationByIdBehaviour } from './find-accreditation-by-id.contract.js'

/**
 * @import { OrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
 * @import { OrganisationsRepositoryFactory } from '#repositories/organisations/port.js'
 * @typedef {{ mongoClient: MongoClient, organisationsRepository: OrganisationsRepositoryFactory }} MongoFixtures
 */

const DATABASE_NAME = 'epr-backend'

const organisationBuilders = async (
  // eslint-disable-next-line no-empty-pattern
  /** @type {object} */ {},
  /** @type {(builders: OrganisationBuilders) => Promise<void>} */ use
) => {
  await use(createOrganisationBuilders())
}

describe('findAccreditationById over the in-memory organisations repository', () => {
  testFindAccreditationByIdBehaviour(
    base.extend({
      organisationsRepository: async (
        // eslint-disable-next-line no-empty-pattern
        /** @type {object} */ {},
        /** @type {(factory: OrganisationsRepositoryFactory) => Promise<void>} */ use
      ) => {
        await use(createInMemoryOrganisationsRepository([]))
      },
      organisationBuilders
    })
  )
})

describe('findAccreditationById over the MongoDB organisations repository', () => {
  const it = /** @type {import('vitest').TestAPI<MongoFixtures>} */ (
    mongoIt.extend({
      mongoClient: async ({ db }, use) => {
        const client = await MongoClient.connect(db)
        await use(client)
        await client.close()
      },
      organisationsRepository: async ({ mongoClient }, use) => {
        await use(
          await createOrganisationsRepository(mongoClient.db(DATABASE_NAME))
        )
      }
    })
  )

  beforeEach(
    /** @param {MongoFixtures} fixture */ async ({ mongoClient }) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection(COLLECTION_NAME)
        .deleteMany({})
    }
  )

  testFindAccreditationByIdBehaviour(it.extend({ organisationBuilders }))
})
