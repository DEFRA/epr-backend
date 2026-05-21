import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
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
 *   userId?: string,
 *   subCategory?: string,
 *   limit?: number,
 *   cursor?: string,
 *   direction?: 'next' | 'prev'
 * }} SystemLogsSearchQuery
 */

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const systemLogsSearchPath = '/v1/system-logs/search'

export const systemLogsGetSearch = {
  method: 'GET',
  path: systemLogsSearchPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
    validate: {
      query: Joi.object({
        organisationId: Joi.string().optional(),
        userId: Joi.string().trim().optional(),
        subCategory: Joi.string().optional(),
        limit: Joi.number().integer().min(1).optional(),
        cursor: Joi.string().hex().length(24).optional(),
        direction: Joi.string().valid('next', 'prev').optional()
      }).or('organisationId', 'userId', 'subCategory')
    }
  },
  /**
   * @param {HapiRequest<unknown> & {
   *   query: SystemLogsSearchQuery,
   *   systemLogsRepository: SystemLogsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { systemLogsRepository, logger } = request
    const { organisationId, userId, subCategory, limit, cursor, direction } =
      request.query

    try {
      const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)

      const result = await systemLogsRepository.find({
        organisationId,
        userId,
        subCategory,
        limit: effectiveLimit,
        cursor,
        direction
      })

      const response = {
        systemLogs: result.systemLogs,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        ...(result.prevCursor ? { prevCursor: result.prevCursor } : {})
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
