import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/index.js'
import { logger } from './logging/logger.js'

export function failAction(_request, _h, error) {
  logger.warn({
    message: error?.message ?? error.toString(),
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
    },
    http: {
      response: {
        status_code: error?.output?.statusCode ?? 400
      }
    }
  })
  throw error
}
