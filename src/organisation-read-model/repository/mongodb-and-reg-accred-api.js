import { latestOpenYear } from '#common/helpers/dates/latest-open-year.js'
import { storedOrgId } from '#repositories/organisations/helpers.js'
import { findAll, findOne, findPage } from './mongodb-find.js'
import {
  EXTERNAL_ACCREDITATIONS_COLLECTION_NAME,
  REG_ACCRED_ACCREDITATION_YEAR
} from '../external-accreditations/external-accreditation-sources.js'
import { createRegAccredAccreditationsLoader } from './reg-accred-accreditations.js'
import { toReadModelOrganisations } from './to-read-model.js'

/** @import { Collection, Db } from 'mongodb' */
/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation as StoredOrganisation } from '#domain/organisations/model.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationReadRepository } from './port.js' */
/** @import { ExternalAccreditation } from './to-read-model.js' */
/** @import { RegAccredApiConfig } from '#common/helpers/reg-accred-api.js' */

/**
 * Loads the external accreditations for a year of the given organisation, or
 * of every organisation when none is given.
 *
 * @typedef {(year: Year, organisationNumber?: OrganisationNumber) => Promise<ExternalAccreditation[]>} ExternalAccreditationsLoader
 */

/**
 * Given `regAccredApi`, external accreditations come from Reg Accred. Left
 * out, they come from the `external-accreditations` collection.
 *
 * @typedef {{
 *   regAccredApi?: RegAccredApiConfig
 * }} OrganisationReadRepositoryOptions
 */

/**
 * @param {Year | undefined} year
 * @returns {boolean}
 */
const isAllYears = (year) => year === undefined

/**
 * @param {Year | undefined} year
 * @returns {boolean}
 */
const isRegAccredYear = (year) => year === REG_ACCRED_ACCREDITATION_YEAR

/**
 * Wraps a loader so it loads nothing for a year the service does not serve
 * yet, and asks neither Reg Accred nor the `external-accreditations`
 * collection for one. It checks on every load, so loading starts when the
 * year opens, without a restart.
 *
 * @param {ExternalAccreditationsLoader} load
 * @returns {ExternalAccreditationsLoader}
 */
const whileYearIsOpen = (load) => async (year, organisationNumber) =>
  year <= latestOpenYear() ? load(year, organisationNumber) : []

/**
 * Loads external accreditations from the `external-accreditations` collection.
 * Overseas sites an accreditation was stored with before they were lifted from
 * its registration are not read.
 *
 * @param {Db} db
 * @returns {ExternalAccreditationsLoader}
 */
const createMongoExternalAccreditationsLoader =
  (db) => (year, organisationNumber) =>
    /** @type {Collection<ExternalAccreditation>} */ (
      db.collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
    )
      .find(
        { year, ...(organisationNumber && { organisationNumber }) },
        { projection: { _id: 0, overseasSites: 0 } }
      )
      .toArray()

/**
 * Reads the organisations collection directly, adds the external
 * accreditations held for them, and serves what it finds in the read model's
 * shape. External accreditations exist only for 2027, so they are loaded only
 * once 2027 is open, and only when the year asked for is 2027 or omitted.
 *
 * It reads `epr-organisations`, which the organisations repository owns,
 * naming it through that repository's `COLLECTION_NAME` in mongodb.js.
 * Once the read model has its own collection, that import is the place to
 * separate them.
 *
 * `find` filters and counts the stored organisations, then puts the page into
 * the read model's shape. An organisation the model leaves out still counts
 * towards `totalItems`, so its page comes back short.
 *
 * @param {Db} db
 * @param {OrganisationReadRepositoryOptions} [options]
 * @returns {(dependencies: {
 *   overseasSitesRepository: Pick<OverseasSitesRepository, 'findByIds'>
 *   logger: Pick<TypedLogger, 'warn'>
 * }) => OrganisationReadRepository}
 */
export const createMongoOrganisationReadRepository =
  (db, { regAccredApi } = {}) =>
  (dependencies) => {
    const loadExternalAccreditations = whileYearIsOpen(
      regAccredApi
        ? createRegAccredAccreditationsLoader(regAccredApi, {
            onDrop: (message) => dependencies.logger.warn({ message })
          })
        : createMongoExternalAccreditationsLoader(db)
    )

    /**
     * @param {StoredOrganisation} stored
     * @param {Year} [year]
     * @returns {Promise<ExternalAccreditation[]>}
     */
    const findExternalAccreditationsOf = async (stored, year) =>
      isAllYears(year) || isRegAccredYear(year)
        ? loadExternalAccreditations(
            REG_ACCRED_ACCREDITATION_YEAR,
            stored.organisationNumber
          )
        : []

    return {
      findByOrganisationNumber: async (organisationNumber, { year } = {}) => {
        const stored = await findOne(db, {
          orgId: storedOrgId(organisationNumber)
        })
        if (!stored) {
          return null
        }
        const [organisation] = await toReadModelOrganisations(
          [stored],
          await findExternalAccreditationsOf(stored, year),
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

      findAll: async ({ year } = {}) => {
        const stored = await findAll(db)
        return toReadModelOrganisations(
          stored,
          stored.length > 0 && (isAllYears(year) || isRegAccredYear(year))
            ? await loadExternalAccreditations(REG_ACCRED_ACCREDITATION_YEAR)
            : [],
          dependencies,
          year
        )
      }
    }
  }
