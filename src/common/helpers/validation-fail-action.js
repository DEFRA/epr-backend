import Boom from '@hapi/boom'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/index.js'

/**
 * Fail action for Joi request validation errors that returns 422 and logs details.
 * Use this instead of the default failAction when routes need 422 status.
 *
 * @param {import('../hapi-types.js').HapiRequest} request
 * @param {object} _h - Hapi response toolkit (unused)
 * @param {object} err - Joi validation error
 * @returns {never}
 */
export function requestValidationFailAction(request, _h, err) {
  const boomError = Boom.badData(err.message, err.details)

  request.logger.error({
    err: boomError,
    message: `${boomError.message} | data: ${JSON.stringify(err.details)}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
    },
    http: {
      response: {
        status_code: boomError.output.statusCode
      }
    }
  })

  throw boomError
}
