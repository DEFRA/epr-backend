import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

export const overseasSiteDeletePath = '/v1/overseas-sites/{id}'

export const overseasSiteDelete = {
  method: 'DELETE',
  path: overseasSiteDeletePath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {overseasSitesRepository: OverseasSitesRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { overseasSitesRepository, params, logger } = request
    const { id } = params

    try {
      const removed = await overseasSitesRepository.remove(id)

      if (!removed) {
        throw Boom.notFound('Overseas site not found')
      }

      logger.info({
        message: `Overseas site deleted: id=${id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: id
        }
      })

      return h.response().code(StatusCodes.NO_CONTENT)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${overseasSiteDeletePath}`,
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

      throw Boom.badImplementation(`Failure on ${overseasSiteDeletePath}`)
    }
  }
}
