import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  handleSystemLogsError,
  respondWithSystemLogs
} from './helpers.js'

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
      }).or('organisationId', 'email', 'subCategory')
    }
  },
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

      return respondWithSystemLogs(result, h, logger)
    } catch (error) {
      return handleSystemLogsError(error, logger, systemLogsSearchPath)
    }
  }
}
