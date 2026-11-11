import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { resolveOverseasSiteDetails } from '#overseas-sites/application/resolve-overseas-site-details.js'
import { STRATEGY_NAME as BASIC_AUTH } from '#plugins/auth/basic-auth-plugin.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationAdministrationRepository } from '#repositories/organisations/administration-port.js' */

export const accreditationOverseasSitesPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/overseas-sites'

const objectId = () =>
  Joi.string()
    .pattern(/^[a-f0-9]{24}$/)
    .required()

export const accreditationOverseasSitesList = {
  method: 'GET',
  path: accreditationOverseasSitesPath,
  options: {
    auth: {
      strategies: ['access-token', BASIC_AUTH],
      scope: [SCOPES.organisationRead, SCOPES.adminRead]
    },
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
   * @param {HapiRequest & {
   *   organisationAdministrationRepository: OrganisationAdministrationRepository,
   *   overseasSitesRepository: OverseasSitesRepository,
   *   params: { organisationId: string, registrationId: string, accreditationId: string }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const {
      organisationAdministrationRepository,
      overseasSitesRepository,
      params,
      logger
    } = request
    const { organisationId, registrationId, accreditationId } = params

    try {
      const [registration] = await Promise.all([
        organisationAdministrationRepository.findRegistrationById(
          organisationId,
          registrationId
        ),
        organisationAdministrationRepository.findAccreditationById(
          organisationId,
          accreditationId
        )
      ])

      if (registration.accreditationId !== accreditationId) {
        throw Boom.notFound(
          `Accreditation with id ${accreditationId} not found for registration ${registrationId}`
        )
      }

      const sites = await resolveOverseasSiteDetails(
        overseasSitesRepository,
        registration.overseasSites
      )

      logger.info({
        message: `Overseas sites listed for accreditation: ${accreditationId}, count=${Object.keys(sites).length}`,
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
