import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { auditOverseasSiteCreate } from '../auditing.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { overseasSiteCreatePayloadSchema } from './post.schema.js'

/** @import { OverseasSite, OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

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
   * @param {import('#common/hapi-types.js').HapiRequest<Omit<OverseasSite, 'id' | 'createdAt' | 'updatedAt'>> & {overseasSitesRepository: OverseasSitesRepository, systemLogsRepository: SystemLogsRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { overseasSitesRepository, payload, logger } = request

    try {
      const now = new Date()

      /** @type {Omit<OverseasSite, 'id' | 'createdAt' | 'updatedAt'>} */
      const siteData = payload
      const site = await overseasSitesRepository.create({
        ...siteData,
        createdAt: now,
        updatedAt: now
      })

      await auditOverseasSiteCreate(request, site)

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
