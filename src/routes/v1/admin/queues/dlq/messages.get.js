import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { dlqMessagesResponseSchema } from './response.schema.js'

export const dlqMessagesPath = '/v1/admin/queues/dlq/messages'

export const dlqMessagesGet = {
  method: 'GET',
  path: dlqMessagesPath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api', 'admin'],
    response: {
      schema: dlqMessagesResponseSchema
    }
  },
  handler: async (request, h) => {
    const { logger, dlqService } = request

    try {
      const result = await dlqService.getMessages()
      return h.response(result).code(StatusCodes.OK)
    } catch (error) {
      logger.error({
        err: error,
        message: `Failure on ${dlqMessagesPath}`
      })

      throw Boom.badImplementation(`Failure on ${dlqMessagesPath}`)
    }
  }
}
