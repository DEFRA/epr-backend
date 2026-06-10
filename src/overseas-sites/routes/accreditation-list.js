import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES, SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#overseas-sites/repository/port.js').OverseasSitesRepository} OverseasSitesRepository */

export const accreditationOverseasSitesPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/overseas-sites'

const objectId = () =>
  Joi.string()
    .pattern(/^[a-f0-9]{24}$/)
    .required()

/**
 * Resolves a registration's approved overseas-site map into detail records,
 * sorted by their three-digit ORS id. Detail is null for any approved site
 * whose record cannot be found.
 *
 * @param {OverseasSitesRepository} overseasSitesRepository
 * @param {Record<string, { overseasSiteId: string }> | undefined} overseasSites
 */
const resolveApprovedSites = async (overseasSitesRepository, overseasSites) => {
  const entries = Object.entries(overseasSites ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  if (entries.length === 0) {
    return []
  }

  const sites = await overseasSitesRepository.findByIds(
    entries.map(([, { overseasSiteId }]) => overseasSiteId)
  )
  const sitesById = new Map(sites.map((site) => [site.id, site]))

  return entries.map(([orsId, { overseasSiteId }]) => {
    const site = sitesById.get(overseasSiteId)
    return {
      orsId,
      name: site?.name ?? null,
      country: site?.country ?? null,
      address: site?.address ?? null
    }
  })
}

export const accreditationOverseasSitesList = {
  method: 'GET',
  path: accreditationOverseasSitesPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser, SCOPES.adminRead]),
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: objectId(),
        registrationId: objectId(),
        accreditationId: objectId()
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository, overseasSitesRepository: OverseasSitesRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationsRepository, overseasSitesRepository, params, logger } =
      request
    const { organisationId, registrationId, accreditationId } = params

    try {
      const [registration] = await Promise.all([
        organisationsRepository.findRegistrationById(
          organisationId,
          registrationId
        ),
        organisationsRepository.findAccreditationById(
          organisationId,
          accreditationId
        )
      ])

      if (registration.accreditationId !== accreditationId) {
        throw Boom.notFound(
          `Accreditation with id ${accreditationId} not found for registration ${registrationId}`
        )
      }

      const sites = await resolveApprovedSites(
        overseasSitesRepository,
        registration.overseasSites
      )

      logger.info({
        message: `Overseas sites listed for accreditation: ${accreditationId}, count=${sites.length}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: accreditationId
        }
      })

      return h.response(sites).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${accreditationOverseasSitesPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: StatusCodes.INTERNAL_SERVER_ERROR
          }
        }
      })

      throw Boom.badImplementation(
        `Failure on ${accreditationOverseasSitesPath}`
      )
    }
  }
}
