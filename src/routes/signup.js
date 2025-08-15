import Boom from '@hapi/boom'
import { createLogger } from '../common/helpers/logging/logger.js'

/**
 * Test endpoint to receive payloads and respond with status.
 */
const signup = {
  method: 'POST',
  path: '/signup',
  options: {
    validate: {
      payload: (value, _options) => {
        if (!value || typeof value !== 'object') {
          throw Boom.badRequest('Invalid payload — must be JSON object')
        }
        return value
      }
    }
  },
  handler: async (request, h) => {
    const logger = createLogger()

    logger.info({ payload: request.payload }, 'Received signup payload')

    return h.response({
      success: true,
      receivedAt: new Date().toISOString(),
      originalPayload: request.payload
    })
  }
}

export { signup }
