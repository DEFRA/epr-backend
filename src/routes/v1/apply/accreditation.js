import Boom from '@hapi/boom'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'

const path = '/v1/apply/accreditation'

/**
 * Apply: Accreditation
 * Stores accreditation data an activity/site/material combinations against an organisation.
 */
const accreditation = {
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
  handler: async ({ payload }, h) => {
    const logger = createLogger()

    logger.info({
      message: 'Received accreditation payload',
      data: payload, // @fixme: remove!!!
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
      }
    })

    return h.response()
  }
}

const accreditationPath = path

export { accreditation, accreditationPath }
