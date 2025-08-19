import Joi from 'joi'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'
import { HTTP_STATUS } from '../../../common/constants/http-status-codes.js'
import { badRequestResponseSchema } from '../../../schemas/bad-request-response-schema.js'

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
      payload: Joi.object().unknown(true).required().messages({
        'object.base': 'Invalid payload — must be a JSON object',
        'any.required': 'Invalid payload — required'
      })
    },
    plugins: {
      'hapi-swagger': {
        responses: {
          [HTTP_STATUS.OK]: {
            description: 'Accreditation submission successful',
            schema: Joi.object({
              message: Joi.string().example(
                'Accreditation submission successful'
              )
            })
          },
          [HTTP_STATUS.BAD_REQUEST]: {
            description: 'Invalid payload',
            schema: badRequestResponseSchema
          }
        }
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
