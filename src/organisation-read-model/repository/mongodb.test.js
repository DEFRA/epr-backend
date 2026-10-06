import { MongoClient, ObjectId } from 'mongodb'

import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { createOrganisationReadRepository } from './adapter.js'
import { testOrganisationReadRepositoryContract } from './port.contract.js'

/** @import { TestAPI } from 'vitest' */
/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryWith } from './port.contract.js' */
/** @import { TypedLogger } from '#common/hapi-types.js' */

/**
 * @typedef {{
 *   mongoClient: MongoClient
 *   organisationReadRepositoryWith: OrganisationReadRepositoryWith
 * }} MongoFixtures
 */

const DATABASE_NAME = 'epr-backend'

/**
 * Stored as-is, so records the write path would refuse can be read back.
 *
 * @param {any} record
 */
const toDocument = ({ id, ...rest }) => ({
  _id: ObjectId.createFromHexString(id),
  ...rest
})

const it = /** @type {TestAPI<MongoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    organisationReadRepositoryWith: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      await database.collection('epr-organisations').deleteMany({})
      await database.collection('overseas-sites').deleteMany({})

      /** @type {OrganisationReadRepositoryWith} */
      const organisationReadRepositoryWith = async ({
        organisations,
        overseasSites = [],
        logger = { warn: () => {} }
      }) => {
        for (const organisation of organisations) {
          await database
            .collection('epr-organisations')
            .insertOne(toDocument(organisation))
        }
        for (const site of overseasSites) {
          await database
            .collection('overseas-sites')
            .insertOne(toDocument(site))
        }

        return createOrganisationReadRepository({
          organisationsRepository: (
            await createOrganisationsRepository(database)
          )(),
          overseasSitesRepository: (
            await createOverseasSitesRepository(database)
          )(),
          logger: /** @type {TypedLogger} */ (/** @type {unknown} */ (logger))
        })
      }
      await use(organisationReadRepositoryWith)
    }
  })
)

describe('organisation read repository over MongoDB repositories', () => {
  testOrganisationReadRepositoryContract(
    /** @type {OrganisationReadRepositoryContractIt} */ (
      /** @type {unknown} */ (it)
    )
  )
})
