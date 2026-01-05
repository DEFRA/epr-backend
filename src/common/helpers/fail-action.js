import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/index.js'

/**
 * @param {import('../hapi-types.js').HapiRequest} request
 * @returns {never}
 */
export function failAction(request, _h, error) {
  request.logger.warn({
    err: error,
    message: error?.message ?? error.toString(),
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
    },
    http: {
      response: {
        status_code: error?.output?.statusCode ?? StatusCodes.BAD_REQUEST
      }
    }
  })
  throw error
}
