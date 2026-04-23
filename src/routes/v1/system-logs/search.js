import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  handleSystemLogsError,
  respondWithSystemLogs
} from './helpers.js'

/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */

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

      return respondWithSystemLogs(result, h, logger)
    } catch (error) {
      return handleSystemLogsError(error, logger, systemLogsPath)
    }
  }
}
