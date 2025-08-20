import { pino } from 'pino'
import { loggerOptions } from './logger-options.js'

function createLogger() {
  const logger = pino(loggerOptions)

  const pinoError = logger.error.bind(logger)

  logger.error = (err, log = {}) => {
    if (err instanceof Error) {
      return pinoError({
        error: {
          message: err.message,
          stack_trace: err.stack,
          type: err.name
        },
        ...log
      })
    }
    return pinoError(err, log)
  }

  return logger
}

export { createLogger }
