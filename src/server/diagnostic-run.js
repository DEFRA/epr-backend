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
 * it is logged.
 *
 * `action`, `reference` and `reason` are the three that do survive, so they
 * carry anything a reader needs to filter on: `event.action` makes a line
 * findable without a regex, `event.reference` ties it to the report it is
 * about, and `event.reason` takes one dimension to slice that population by.
 *
 * @param {string} action
 * @param {string} message
 * @param {{ reference?: string, reason?: string }} [fields]
 */
export const log = (action, message, { reference, reason } = {}) =>
  logger.info({
    message,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action,
      ...(reference ? { reference } : {}),
      ...(reason ? { reason } : {})
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
