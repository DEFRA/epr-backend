import Boom from '@hapi/boom'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'
import { HTTP_STATUS } from '../../../common/constants/http-status-codes.js'

/*
 * Accreditation endpoint
 * Purpose: To accredit an organisation or site under a specified accreditation type.
 * Handles accreditation details and stores them for further processing.
 */

const accreditation = {
  method: 'POST',
  path: '/v1/apply/accreditation',
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
      message: 'Received accreditation payload',
      event: {
        category: LOGGING_EVENT_CATEGORIES.API,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
      }
    })

    return h.response().code(HTTP_STATUS.OK)
  }
}

export { accreditation }
