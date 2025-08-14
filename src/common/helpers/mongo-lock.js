import { createLogger } from './logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/event.js'

export class MongoLockError extends Error {
  constructor(message, ...rest) {
    super(...rest)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MongoLockError)
    }

    this.name = 'MongoLockError'
    this.message = message

    Object.setPrototypeOf(this, MongoLockError.prototype)
  }
}

async function acquireLock(locker, resource) {
  const lock = await locker.lock(resource)

  if (!lock) {
    const logger = createLogger()
    const err = new MongoLockError('Could not acquire mongo resource lock')

    logger.error(err, {
      message: `Failed to acquire lock for ${resource}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.DB,
        action: LOGGING_EVENT_ACTIONS.LOCK_ACQUISITION_FAILED
      }
    })

    return null
  }
  return lock
}

async function requireLock(locker, resource) {
  const lock = await locker.lock(resource)
  if (!lock) {
    throw new Error(`Failed to acquire lock for ${resource}`)
  }
  return lock
}

export { acquireLock, requireLock }
