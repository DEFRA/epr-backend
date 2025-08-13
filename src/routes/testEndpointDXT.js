import Boom from '@hapi/boom'
import { createLogger } from '../common/helpers/logging/logger.js'

/**
 * Test endpoint to receive payloads and respond with status.
 * No external integrations.
 */
const testEndpointDXT = {
  method: 'POST',
  path: '/test-endpoint-dxt',
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

    logger.info('Received test-endpoint-dxt payload:', request.payload)

    return h.response({
      success: true,
      receivedAt: new Date().toISOString(),
      originalPayload: request.payload
    })
  }
}

export { testEndpointDXT }
