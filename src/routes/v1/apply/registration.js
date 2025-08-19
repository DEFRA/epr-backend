import { createLogger } from '../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../common/enums/event.js'
import Joi from 'joi'
import { HTTP_STATUS } from '../../../common/constants/http-status-codes.js'
import { badRequestResponseSchema } from '../../../schemas/bad-request-response-schema.js'

/*
 * Registration endpoint
 * Purpose: To register an applicant organisation.
 * Handles initial organisation details and stores them for further processing.
 */

const registration = {
  method: 'POST',
  path: '/v1/apply/registration',
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
            description: 'Registration submission successful',
            schema: Joi.object({
              message: Joi.string().example(
                'Registration submission successful'
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
    return h.response().code(200)
  }
}

export { registration }
