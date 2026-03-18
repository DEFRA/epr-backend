import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { auditOverseasSiteUpdate } from '#root/auditing/overseas-sites.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { overseasSiteUpdatePayloadSchema } from './put-by-id.schema.js'

/** @import { OverseasSite, OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

export const overseasSiteUpdatePath = '/v1/overseas-sites/{id}'

export const overseasSiteUpdate = {
  method: 'PUT',
  path: overseasSiteUpdatePath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api'],
    validate: {
      payload: overseasSiteUpdatePayloadSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest<Partial<Omit<OverseasSite, 'id' | 'createdAt' | 'updatedAt'>>> & {overseasSitesRepository: OverseasSitesRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { overseasSitesRepository, params, payload, logger } = request
    const { id } = params

    try {
      const previous = await overseasSitesRepository.findById(id)

      if (!previous) {
        throw Boom.notFound('Overseas site not found')
      }

      /** @type {Partial<Omit<OverseasSite, 'id' | 'createdAt' | 'updatedAt'>>} */
      const updates = payload
      const site = await overseasSitesRepository.update(id, {
        ...updates,
        updatedAt: new Date()
      })

      await auditOverseasSiteUpdate(request, id, previous, site)

      logger.info({
        message: `Overseas site updated: id=${id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: id
        }
      })

      return h.response(site).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${overseasSiteUpdatePath}`,
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

      throw Boom.badImplementation(`Failure on ${overseasSiteUpdatePath}`)
    }
  }
}
