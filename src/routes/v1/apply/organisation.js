import Boom from '@hapi/boom'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'

/*
 * Organisation endpoint
 * Purpose: The initial signup manage organisation records.
 * Provides organisation-level data to support registration and accreditation flows through org id.
 */

const organisation = {
  method: 'POST',
  path: '/v1/apply/organisation',
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
      orgId: 'ORG12345', // TODO: generate correctly structured orgId to be specified and done in later ticket
      orgName: 'ORGABCD', // depending on the field names from the form creators, given in the response
      referenceNumber: 'REF12345' // TODO: generate correctly structured reference number to be specified and done in later ticket
    })
  }
}

export { organisation }
