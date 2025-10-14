import { fileURLToPath } from 'node:url'
import path from 'node:path'

import Piscina from 'piscina'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ONE_MINUTE = 60_000

const pool = new Piscina({
  filename: path.join(
    __dirname,
    'worker/summary-logs-validator-worker-thread.js'
  ),
  maxThreads: 1, // Match vCPU count on AWS instance
  idleTimeout: ONE_MINUTE
})

/** @typedef {import('./summary-logs-validator.port.js').SummaryLogsValidator} SummaryLogsValidator */

/**
 * @returns {SummaryLogsValidator}
 */
export const createSummaryLogsValidator = () => {
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
          logger.error(err, {
            message: `Summary log validation worker failed [${summaryLog.id}]`,
            event: {
              category: LOGGING_EVENT_CATEGORIES.SERVER,
              action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
            }
          })
        })
    }
  }
}

export const closeWorkerPool = async () => {
  await pool.destroy()
}
