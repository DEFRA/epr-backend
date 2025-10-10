import fs from 'fs'
import { logger } from './logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/event.js'

export function getLocalSecret(name) {
  try {
    return fs.readFileSync(process.env[name], 'utf8').toString().trim()
  } catch (error) {
    logger.error({
      error,
      message: `An error occurred while trying to read the secret: ${name}.\n${error}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SECRET,
        action: LOGGING_EVENT_ACTIONS.READ_ERROR
      }
    })

    return null
  }
}
