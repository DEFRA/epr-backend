import { pino } from 'pino'
import { loggerOptions } from './logger-options.js'

let loggerInstance

function createLogger() {
  return pino(loggerOptions)
}

export function getLoggerInstance() {
  if (!loggerInstance) {
    loggerInstance = createLogger()
  }
  return loggerInstance
}

export function formatError(err) {
  if (!(err instanceof Error)) {
    return {}
  }

  return {
    error: {
      message: err.message,
      stack_trace: err.stack,
      type: err.name
    }
  }
}

export const logger = getLoggerInstance()
