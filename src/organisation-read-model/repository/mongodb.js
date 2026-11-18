import { latestOpenYear } from '#common/helpers/dates/latest-open-year.js'
import { storedOrgId } from '#repositories/organisations/helpers.js'
import { findAll, findOne, findPage } from '../reex-store/mongodb.js'
import { REG_ACCRED_ACCREDITATION_YEAR } from '../registration-service/reg-accred.js'
import { standInRegistrationService } from '../registration-service/stand-in/mongodb.js'
import { toReadModelOrganisations } from './to-read-model.js'

/** @import { Db } from 'mongodb' */
/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation as StoredOrganisation } from '#domain/organisations/model.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationReadRepository } from './port.js' */
/** @import { ExternalAccreditation, ExternalAccreditationsLoader, RegistrationService } from '../registration-service/port.js' */

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
 * Reads organisations from re-ex's store, adds the external accreditations
 * the registration service holds for them, and serves what it finds in the
 * read model's shape. External accreditations exist only for 2027, so they are
 * loaded only once 2027 is open, and only when the year asked for is 2027 or
 * omitted. Without a registration service, the stand-in collection is it.
 *
 * `find` filters and counts the stored organisations, then puts the page into
 * the read model's shape. An organisation the model leaves out still counts
 * towards `totalItems`, so its page comes back short.
 *
 * @param {Db} db
 * @param {RegistrationService} [registrationService]
 * @returns {(dependencies: {
 *   overseasSitesRepository: Pick<OverseasSitesRepository, 'findByIds'>
 *   logger: Pick<TypedLogger, 'warn'>
 * }) => OrganisationReadRepository}
 */
export const createOrganisationReadRepository =
  (db, registrationService = standInRegistrationService(db)) =>
  (dependencies) => {
    const loadExternalAccreditations = whileYearIsOpen(
      registrationService(dependencies)
    )

    /**
     * @param {StoredOrganisation} stored
     * @param {Year} [year]
     * @returns {Promise<ExternalAccreditation[]>}
     */
    const findExternalAccreditationsOf = async (stored, year) =>
      year !== undefined && year !== REG_ACCRED_ACCREDITATION_YEAR
        ? []
        : loadExternalAccreditations(
            REG_ACCRED_ACCREDITATION_YEAR,
            stored.organisationNumber
          )

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

      findAll: async () => {
        const stored = await findAll(db)
        return toReadModelOrganisations(
          stored,
          stored.length === 0
            ? []
            : await loadExternalAccreditations(REG_ACCRED_ACCREDITATION_YEAR),
          dependencies
        )
      }
    }
  }
