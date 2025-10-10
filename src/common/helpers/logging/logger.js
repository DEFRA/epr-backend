import { pino } from 'pino'
import { loggerOptions } from './logger-options.js'

export const logger = pino(loggerOptions)

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
