import { storedOrgId } from '#repositories/organisations/helpers.js'
import {
  findAll,
  findOne,
  findPage
} from '#repositories/organisations/mongodb-find.js'
import {
  registrationNumbersOf,
  toReadModelOrganisations
} from './to-read-model.js'

/** @import { Collection, Db } from 'mongodb' */
/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Organisation as StoredOrganisation } from '#domain/organisations/model.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationReadRepository } from './port.js' */
/** @import { ExternalAccreditation } from './to-read-model.js' */

export const EXTERNAL_ACCREDITATIONS_COLLECTION_NAME = 'external-accreditations'

/**
 * @param {Db} db
 * @param {StoredOrganisation[]} stored
 * @returns {Promise<ExternalAccreditation[]>}
 */
const findExternalAccreditations = (db, stored) =>
  /** @type {Collection<ExternalAccreditation>} */ (
    db.collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
  )
    .find(
      { registrationNumber: { $in: registrationNumbersOf(stored) } },
      { projection: { _id: 0 } }
    )
    .toArray()

/**
 * Reads the organisations and external accreditations collections directly, and
 * serves what it finds in the read model's shape.
 *
 * It shares the organisations repository's reads through the
 * `#repositories/organisations/mongodb-find.js` import while both read
 * `epr-organisations`, so a change to that repository's find changes this one
 * too. Once the read model has its own collection, that import is the place
 * to separate them.
 *
 * `find` filters and counts the stored organisations, then puts the page into
 * the read model's shape. An organisation the model leaves out still counts
 * towards `totalItems`, so its page comes back short.
 *
 * @param {Db} db
 * @returns {(dependencies: {
 *   overseasSitesRepository: Pick<OverseasSitesRepository, 'findByIds'>
 *   logger: Pick<TypedLogger, 'warn'>
 * }) => OrganisationReadRepository}
 */
export const createOrganisationReadRepository = (db) => {
  return (dependencies) => ({
    findByOrganisationNumber: async (organisationNumber, { year } = {}) => {
      const stored = await findOne(db, {
        orgId: storedOrgId(organisationNumber)
      })
      if (!stored) {
        return null
      }
      const [organisation] = await toReadModelOrganisations(
        [stored],
        await findExternalAccreditations(db, [stored]),
        dependencies,
        year
      )
      return organisation ?? null
    },

    find: async (params) => {
      const { items, ...page } = await findPage(db, params)
      return {
        ...page,
        items: await toReadModelOrganisations(items, [], dependencies)
      }
    },

    findAll: async () => {
      const stored = await findAll(db)
      return toReadModelOrganisations(
        stored,
        await findExternalAccreditations(db, stored),
        dependencies
      )
    }
  })
}
