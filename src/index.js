import process from 'node:process'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from './common/enums/index.js'

import { createLogger } from './common/helpers/logging/logger.js'
import { startServer } from './start-server.js'

await startServer()

process.on('unhandledRejection', (error) => {
  const logger = createLogger()
  logger.error(error, {
    message: 'Unhandled rejection',
    event: {
      category: LOGGING_EVENT_CATEGORIES.HTTP,
      action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE
    },
    http: {
      response: {
        status_code: error?.output?.status_code ?? 500
      }
    }
  })
  process.exitCode = 1
})
