import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

export const dlqPurgePath = '/v1/admin/queues/dlq/purge'

export const dlqPurgePost = {
  method: 'POST',
  path: dlqPurgePath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api', 'admin']
  },
  handler: async (request, h) => {
    const { logger, dlqService } = request

    try {
      await dlqService.purge()
      return h.response({ purged: true }).code(StatusCodes.OK)
    } catch (error) {
      logger.error({
        err: error,
        message: `Failure on ${dlqPurgePath}`
      })

      throw Boom.badImplementation(`Failure on ${dlqPurgePath}`)
    }
  }
}
