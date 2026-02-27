import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

export const overseasSitesListPath = '/v1/overseas-sites'

export const overseasSitesList = {
  method: 'GET',
  path: overseasSitesListPath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api'],
    validate: {
      query: Joi.object({
        name: Joi.string().optional(),
        country: Joi.string().optional()
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {overseasSitesRepository: OverseasSitesRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { overseasSitesRepository, query, logger } = request

    try {
      const sites = await overseasSitesRepository.findAll(query)

      logger.info({
        message: `Listed ${sites.length} overseas sites`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response(sites).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${overseasSitesListPath}`,
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

      throw Boom.badImplementation(`Failure on ${overseasSitesListPath}`)
    }
  }
}
