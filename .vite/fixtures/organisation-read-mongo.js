import { MongoClient, ObjectId } from 'mongodb'

import { createMongoExternalAccreditationsRepository } from '#external-accreditations/repository/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { toStoredOrganisation } from '#repositories/organisations/helpers.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import {
  EXTERNAL_ACCREDITATIONS_COLLECTION_NAME,
  createOrganisationReadRepository
} from '#organisation-read-model/repository/mongodb.js'

/** @import { TestAPI } from 'vitest' */
/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Organisation as StoredOrganisation } from '#domain/organisations/model.js' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

/**
 * Stores the organisations, overseas sites and external accreditations as the
 * repositories that own them store them, and returns a read repository over
 * them.
 *
 * @typedef {(data: {
 *   externalAccreditations?: ExternalAccreditation[]
 *   logger?: { warn: (...args: any[]) => void }
 *   organisations: object[]
 *   overseasSites?: object[]
 * }) => Promise<OrganisationReadRepository>} OrganisationReadRepositoryWith
 */

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

/**
 * A test with an empty database and `organisationReadRepositoryWith`, which
 * stores what it is given in the shapes MongoDB holds and reads it back
 * through the read repository's MongoDB adapter.
 */
export const it = /** @type {TestAPI<MongoFixtures>} */ (
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
      await database
        .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
        .deleteMany({})

      /** @type {OrganisationReadRepositoryWith} */
      const organisationReadRepositoryWith = async ({
        organisations,
        overseasSites = [],
        externalAccreditations = [],
        logger = { warn: () => {} }
      }) => {
        for (const organisation of organisations) {
          await database
            .collection('epr-organisations')
            .insertOne(
              toDocument(
                toStoredOrganisation(
                  /** @type {StoredOrganisation} */ (organisation)
                )
              )
            )
        }
        for (const site of overseasSites) {
          await database
            .collection('overseas-sites')
            .insertOne(toDocument(site))
        }
        const externalAccreditationsRepository = (
          await createMongoExternalAccreditationsRepository(database)
        )()
        for (const externalAccreditation of externalAccreditations) {
          await externalAccreditationsRepository.upsert(externalAccreditation)
        }

        return createOrganisationReadRepository(database)({
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
