import { pino } from 'pino'
import { loggerOptions } from './logger-options.js'

let loggerInstance

function createLogger() {
  const baseLogger = pino(loggerOptions)

  const pinoError = baseLogger.error.bind(baseLogger)
  baseLogger.error = (err, log = {}) => {
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

  return baseLogger
}

export function getLoggerInstance() {
  if (!loggerInstance) {
    loggerInstance = createLogger()
  }
  return loggerInstance
}

export const logger = getLoggerInstance()
