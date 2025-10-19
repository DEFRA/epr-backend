import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { Piscina } from 'piscina'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const ONE_MINUTE = 60_000

const pool = new Piscina({
  filename: path.join(dirname, 'worker/worker-thread.js'),
  maxThreads: 1, // Match vCPU count on AWS instance
  idleTimeout: ONE_MINUTE
})

/** @typedef {import('#workers/summary-logs/port.js').SummaryLogsValidator} SummaryLogsValidator */

/**
 * @returns {SummaryLogsValidator}
 */
export const createSummaryLogsValidator = (logger) => {
  return {
    validate: async (summaryLog) => {
      logger.info({
        message: `Summary log validation worker spawning [${summaryLog.id}]`
      })

      pool
        .run({ summaryLog })
        .then(() => {
          logger.info({
            message: `Summary log validation worker completed [${summaryLog.id}]`,
            event: {
              category: LOGGING_EVENT_CATEGORIES.SERVER,
              action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
            }
          })
        })
        .catch((err) => {
          logger.error({
            error: err,
            message: `Summary log validation worker failed [${summaryLog.id}]`,
            event: {
              category: LOGGING_EVENT_CATEGORIES.SERVER,
              action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
            }
          })

          // Intentionally not re-throwing as this is the result of a worker thread and the request has already completed...
        })
    }
  }
}

export const closeWorkerPool = async () => {
  await pool.destroy()
}
