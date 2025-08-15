import Boom from '@hapi/boom'
import { createLogger } from '../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../common/enums/event.js'

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

    logger.info({
      message: 'Received accreditation payload',
      event: {
        category: LOGGING_EVENT_CATEGORIES.API,
        action: LOGGING_EVENT_ACTIONS.REQUEST_RECEIVED
      },
      payload: request.payload
    })

    return h.response({
      success: true,
      receivedAt: new Date().toISOString(),
      originalPayload: request.payload
    })
  }
}

export { signup }
