import process from 'node:process'
import { StatusCodes } from 'http-status-codes'
import { formatError } from './logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/index.js'

export function setupGlobalErrorHandler(logger) {
  process.on('unhandledRejection', (error) => {
    logger.error({
      ...formatError(error),
      message: 'Unhandled rejection',
      event: {
        category: LOGGING_EVENT_CATEGORIES.HTTP,
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE
      },
      http: {
        response: {
          status_code:
            error?.output?.status_code ?? StatusCodes.INTERNAL_SERVER_ERROR
        }
      }
    })
    process.exitCode = 1
  })
}
