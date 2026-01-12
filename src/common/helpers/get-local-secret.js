import fs from 'fs'
import { config } from '#root/config.js'
import { logger } from './logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/event.js'

export function getLocalSecret(configKey) {
  try {
    const path = config.get(configKey)
    if (!path) {
      throw new Error(`Config key ${configKey} is not set`)
    }
    return fs.readFileSync(path, 'utf8').toString().trim()
  } catch (error) {
    logger.error({
      error,
      message: `An error occurred while trying to read the secret: ${configKey}.\n${error}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SECRET,
        action: LOGGING_EVENT_ACTIONS.READ_ERROR
      }
    })

    return null
  }
}
