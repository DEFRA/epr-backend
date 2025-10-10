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

export const logger = getLoggerInstance()
