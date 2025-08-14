import { pino } from 'pino'

import { loggerOptions } from './logger-options.js'

function createLogger() {
  const logger = pino(loggerOptions)

  return {
    ...logger,
    error: (err, log) =>
      logger.error({
        error: {
          message: err.message,
          stack_trace: err.stack,
          type: err.name
        },
        ...log
      })
  }
}

export { createLogger }
