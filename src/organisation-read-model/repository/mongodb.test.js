import { MongoClient, ObjectId } from 'mongodb'

import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { createOrganisationReadRepository } from './adapter.js'
import {
  REPROCESSOR_NUMBER,
  findOrganisation,
  reprocessor
} from './contract/organisation-read-test-helpers.js'
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

  it('dates the status timeline from status changes stored as BSON dates', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = buildOrganisation({
      registrations: [
        reprocessor({
          statusHistory: [
            { status: 'created', updatedAt: new Date('2026-01-01T09:00:00Z') },
            { status: 'approved', updatedAt: new Date('2026-02-01T23:30:00Z') }
          ]
        })
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(repository, stored.orgId)

    expect(organisation.registrations[REPROCESSOR_NUMBER]).toHaveProperty(
      'statusTimeline',
      {
        '2026-01-01': { status: 'created' },
        '2026-02-01': { status: 'approved' }
      }
    )
  })
})
