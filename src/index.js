import process from 'node:process'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from './common/enums/index.js'

import { logger } from './common/helpers/logging/logger.js'
import { startServer } from './start-server.js'

await startServer()

process.on('unhandledRejection', (error) => {
  logger.error(error, {
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
