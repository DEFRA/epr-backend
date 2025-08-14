import fs from 'fs'
import { createLogger } from './logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/event.js'

export function getLocalSecret(name) {
  try {
    return fs.readFileSync(process.env[name], 'utf8').toString().trim()
  } catch (err) {
    const logger = createLogger()

    logger.error(err, {
      message: `An error occurred while trying to read the secret: ${name}.\n${err}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SECRET,
        action: LOGGING_EVENT_ACTIONS.READ_ERROR
      }
    })

    return null
  }
}
