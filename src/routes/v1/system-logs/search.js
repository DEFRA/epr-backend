import Joi from 'joi'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

const systemLogsPath = '/v1/system-logs'

export const systemLogsGet = {
  method: 'GET',
  path: systemLogsPath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api', 'admin'],
    validate: {
      query: Joi.object({
        organisationId: Joi.string().required(),
        limit: Joi.number().integer().min(1).optional(),
        cursor: Joi.string().hex().length(24).optional()
      })
    }
  },
  handler: async (request, h) => {
    const { systemLogsRepository, logger } = request
    const { organisationId, limit, cursor } = request.query

    try {
      const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)

      const result = await systemLogsRepository.findByOrganisationId({
        organisationId,
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
        message: `Failure on ${systemLogsPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(`Failure on ${systemLogsPath}`)
    }
  }
}
