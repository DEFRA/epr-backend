import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 *
 * @typedef {{
 *   organisationId?: string,
 *   email?: string,
 *   subCategory?: string,
 *   limit?: number,
 *   cursor?: string
 * }} SystemLogsSearchPayload
 */

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

const systemLogsSearchPath = '/v1/system-logs/search'

export const systemLogsPostSearch = {
  method: 'POST',
  path: systemLogsSearchPath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api', 'admin'],
    validate: {
      payload: Joi.object({
        organisationId: Joi.string().optional(),
        email: Joi.string().trim().optional(),
        subCategory: Joi.string().optional(),
        limit: Joi.number().integer().min(1).optional(),
        cursor: Joi.string().hex().length(24).optional()
      }).or('organisationId', 'email')
    }
  },
  /**
   * @param {HapiRequest<SystemLogsSearchPayload> & {
   *   systemLogsRepository: SystemLogsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { systemLogsRepository, logger } = request
    const { organisationId, email, subCategory, limit, cursor } =
      request.payload

    try {
      const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)

      const result = await systemLogsRepository.find({
        organisationId,
        email,
        subCategory,
        limit: effectiveLimit,
        cursor
      })

      const response = {
        systemLogs: result.systemLogs,
        hasMore: result.hasMore
      }

      if (result.nextCursor) {
        response.nextCursor = result.nextCursor
      }

      logger.info({
        message: `Listed ${result.systemLogs.length} system logs`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response(response).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${systemLogsSearchPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(`Failure on ${systemLogsSearchPath}`)
    }
  }
}
