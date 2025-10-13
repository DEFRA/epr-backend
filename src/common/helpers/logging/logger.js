import { pino } from 'pino'
import { loggerOptions } from './logger-options.js'

export const logger = pino(loggerOptions)
