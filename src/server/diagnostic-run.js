import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { logger } from '#common/helpers/logging/logger.js'

/** @import { LockManager } from 'mongo-locks' */

/**
 * CDP indexes only an allowlisted set of ECS fields, so a figure logged as a
 * property is dropped at ingest and cannot be aggregated in OpenSearch. The
 * figures therefore stay in the message and every breakdown is rolled up before
 * it is logged; `event.action` is what makes a line findable without a regex,
 * and `event.reference` ties it to the report it is about.
 *
 * @param {string} action
 * @param {string} message
 * @param {string} [reference]
 */
export const log = (action, message, reference) =>
  logger.info({
    message,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action,
      ...(reference ? { reference } : {})
    }
  })

/**
 * Runs a startup diagnostic under a cross-instance lock so a single pod per
 * deploy executes it, and contains any failure to the diagnostic itself - a
 * scan that throws must not take the server's startup with it.
 *
 * Losing the lock race is expected on a multi-pod deploy rather than
 * exceptional, so it is logged and returns without running.
 *
 * @param {{
 *   locker: LockManager,
 *   lockName: string,
 *   label: string,
 *   run: () => Promise<void>
 * }} options
 * @returns {Promise<void>}
 */
export const runUnderLock = async ({ locker, lockName, label, run }) => {
  try {
    const lock = await locker.lock(lockName)
    if (!lock) {
      log(
        LOGGING_EVENT_ACTIONS.LOCK_ACQUISITION_FAILED,
        `Unable to obtain lock, skipping ${label}`
      )
      return
    }

    try {
      await run()
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({ err: error, message: `Failed to run ${label}` })
  }
}
