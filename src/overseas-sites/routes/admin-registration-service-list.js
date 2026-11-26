import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { toWireOrgId } from '#common/helpers/organisation-wire.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { fetchRegistrationServiceApplications } from '#overseas-sites/registration-service-applications.js'

/** @import { HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { RegAccredApiConfig } from '#common/helpers/reg-accred-api.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { ExporterRegistration, Organisation } from '#organisation-read-model/index.js' */
/** @import { RegistrationServiceApplication, RegistrationServiceOverseasSite } from '#overseas-sites/registration-service-applications.js' */

/**
 * Serves the overseas sites the registration service holds, so that admins
 * can compare their ORS ids with ours while the two services hold separate
 * copies. It goes once the registration service's ORS ids are corrected.
 */
export const adminRegistrationServiceOverseasSitesListPath =
  '/v1/admin/registration-service/overseas-sites'

/** How many registrations the registration service is asked about at once. */
const CONCURRENT_REQUESTS = 5

/**
 * @typedef {{
 *   organisation: Organisation
 *   registrationNumber: RegistrationNumber
 *   registration: ExporterRegistration
 * }} ExporterRegistrationOf
 */

/**
 * @param {Organisation[]} organisations
 * @returns {ExporterRegistrationOf[]}
 */
const exporterRegistrations = (organisations) =>
  organisations
    .flatMap((organisation) =>
      Object.entries(organisation.registrations).flatMap(
        ([registrationNumber, registration]) =>
          registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
            ? [
                {
                  organisation,
                  registrationNumber: toRegistrationNumber(registrationNumber),
                  registration
                }
              ]
            : []
      )
    )
    .sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber))

/**
 * `fn` applied to each item, with no more than `limit` calls pending at once,
 * the results in the order of the items. Once a call fails, no further call
 * starts.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
const mapConcurrently = async (items, limit, fn) => {
  /** @type {R[]} */
  const results = []
  // The workers share one iterator, so each item is taken once.
  const entries = items.entries()
  let failed = false
  const worker = async () => {
    for (const [index, item] of entries) {
      if (failed) {
        return
      }
      try {
        results[index] = await fn(item) // NOSONAR(javascript:S9382) each worker takes its next item only once this one is done
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return results
}

/**
 * @template T
 * @param {T | undefined} value
 * @returns {T | null}
 */
const nullable = (value) => value ?? null

/**
 * @typedef {{
 *   orgId: number
 *   registrationNumber: RegistrationNumber
 *   packagingWasteCategory: ExporterRegistration['material']
 *   year: number
 *   applicationReference: string | null
 *   applicationStatus: string
 *   accreditationNumber: string | null
 *   siteId: number
 *   orsId: string | null
 *   selected: boolean
 *   overseasReprocessorName: string
 *   formattedAddress: string | null
 *   destinationCountry: string | null
 *   addressLine1: string | null
 *   addressLine2: string | null
 *   cityOrTown: string | null
 *   coordinates: string | null
 * }} RegistrationServiceOverseasSiteRow
 */

/**
 * @param {ExporterRegistrationOf} exporter
 * @param {RegistrationServiceApplication} application
 * @param {RegistrationServiceOverseasSite} site
 * @returns {RegistrationServiceOverseasSiteRow}
 */
const toRow = (
  { organisation, registrationNumber, registration },
  application,
  site
) => ({
  orgId: toWireOrgId(organisation.organisationNumber),
  registrationNumber,
  packagingWasteCategory: registration.material,
  year: application.year,
  applicationReference: nullable(application.applicationReference),
  applicationStatus: application.applicationStatus,
  accreditationNumber: nullable(application.accreditationNumber),
  siteId: site.siteId,
  orsId: site.orsId,
  selected: site.selected,
  overseasReprocessorName: site.siteName,
  formattedAddress: nullable(site.formattedAddress),
  destinationCountry: nullable(site.address?.country),
  addressLine1: nullable(site.address?.line1),
  addressLine2: nullable(site.address?.line2),
  cityOrTown: nullable(site.address?.town),
  coordinates: nullable(site.coordinates)
})

export const adminRegistrationServiceOverseasSitesList = {
  method: 'GET',
  path: adminRegistrationServiceOverseasSitesListPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   organisationReadRepository: import('#organisation-read-model/index.js').OrganisationReadRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { logger, organisationReadRepository } = request
    const config = /** @type {RegAccredApiConfig} */ (
      request.config.get('regAccredApi')
    )
    if (!config.sharedSecret) {
      throw Boom.serverUnavailable(
        'The connection to the registration service is not configured'
      )
    }

    const exporters = exporterRegistrations(
      await organisationReadRepository.findAll()
    )

    let applicationsByExporter
    try {
      applicationsByExporter = await mapConcurrently(
        exporters,
        CONCURRENT_REQUESTS,
        ({ organisation, registrationNumber }) =>
          fetchRegistrationServiceApplications(
            config,
            organisation.organisationNumber,
            registrationNumber
          )
      )
    } catch (error) {
      logger.error({
        err: /** @type {Error} */ (error),
        message: `Failure on ${adminRegistrationServiceOverseasSitesListPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })
      throw Boom.badGateway(
        'The registration service could not serve every registration'
      )
    }

    const rows = exporters.flatMap((exporter, index) =>
      (applicationsByExporter[index] ?? []).flatMap((application) =>
        application.overseasSites.map((site) =>
          toRow(exporter, application, site)
        )
      )
    )

    logger.info({
      message: `Admin listed ${rows.length} registration service overseas sites across ${exporters.length} exporter registrations`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
      }
    })

    return h.response({ rows }).code(StatusCodes.OK)
  }
}
