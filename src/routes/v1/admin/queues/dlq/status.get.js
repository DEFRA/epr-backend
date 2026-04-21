import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

export const dlqStatusPath = '/v1/admin/queues/dlq/status'

export const dlqStatusGet = {
  method: 'GET',
  path: dlqStatusPath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api', 'admin']
  },
  handler: async (request, h) => {
    const { logger, dlqService } = request

    try {
      const status = await dlqService.getStatus()
      return h.response(status).code(StatusCodes.OK)
    } catch (error) {
      logger.error({
        err: error,
        message: `Failure on ${dlqStatusPath}`
      })

      throw Boom.badImplementation(`Failure on ${dlqStatusPath}`)
    }
  }
}
