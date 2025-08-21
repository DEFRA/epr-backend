import Boom from '@hapi/boom'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'

const path = '/v1/apply/registration'

/**
 * Apply: Registration
 * Stores registration data an activity/site/material combinations against an organisation.
 */
const registration = {
  method: 'POST',
  path,
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
  handler: async (_request, h) => {
    const logger = createLogger()

    logger.info({
      message: 'Received registration payload',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
      }
    })
    return h.response()
  }
}

const registrationPath = path

export { registration, registrationPath }
