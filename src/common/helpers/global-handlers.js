import process from 'node:process'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/index.js'

export function setupGlobalErrorHandler(logger) {
  process.on('unhandledRejection', (error) => {
    const statusCode = /** @type {any} */ (error)?.output?.status_code

    logger.error({
      err: error,
      message: 'Unhandled rejection',
      event: {
        category: LOGGING_EVENT_CATEGORIES.HTTP,
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE
      },
      http: {
        response: {
          status_code:
            typeof statusCode === 'number'
              ? statusCode
              : StatusCodes.INTERNAL_SERVER_ERROR
        }
      }
    })
    process.exitCode = 1
  })
}
