import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { overseasSiteCreatePayloadSchema } from './post.schema.js'

/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

export const overseasSitesCreatePath = '/v1/overseas-sites'

export const overseasSitesCreate = {
  method: 'POST',
  path: overseasSitesCreatePath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api'],
    validate: {
      payload: overseasSiteCreatePayloadSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {overseasSitesRepository: OverseasSitesRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { overseasSitesRepository, payload, logger } = request

    try {
      const now = new Date()

      const site = await overseasSitesRepository.create({
        ...payload,
        createdAt: now,
        updatedAt: now
      })

      logger.info({
        message: `Overseas site created: id=${site.id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: site.id
        }
      })

      return h.response(site).code(StatusCodes.CREATED)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${overseasSitesCreatePath}`,
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

      throw Boom.badImplementation(`Failure on ${overseasSitesCreatePath}`)
    }
  }
}
