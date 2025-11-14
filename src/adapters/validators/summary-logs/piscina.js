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
  filename: path.join(
    dirname,
    '../../../workers/summary-logs/worker/worker-thread.js'
  ),
  maxThreads: 1, // Match vCPU count on AWS instance
  idleTimeout: ONE_MINUTE
})

/** @typedef {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} SummaryLogsCommandExecutor */

/**
 * @returns {Promise<void>}
 */
const runCommandInWorker = async (command, summaryLogId, logger) => {
  try {
    await pool.run({ command, summaryLogId })
    logger.info({
      message: `Summary log ${command} worker completed: summaryLogId=${summaryLogId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  } catch (err) {
    logger.error({
      error: err,
      message: `Summary log ${command} worker failed: summaryLogId=${summaryLogId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
  }
}

export const createSummaryLogsCommandExecutor = (logger) => {
  return {
    validate: async (summaryLogId) => {
      // Fire-and-forget: validation runs asynchronously in worker thread, request returns immediately
      // Intentionally not awaiting as the HTTP response completes before validation finishes
      logger.info({
        message: `Summary log validation worker spawning: summaryLogId=${summaryLogId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })

      runCommandInWorker('validate', summaryLogId, logger)
    },
    submit: async (summaryLogId) => {
      // Fire-and-forget: submission runs asynchronously in worker thread, request returns immediately
      // Intentionally not awaiting as the HTTP response completes before submission finishes
      logger.info({
        message: `Summary log submission worker spawning: summaryLogId=${summaryLogId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })

      runCommandInWorker('submit', summaryLogId, logger)
    }
  }
}

export const closeWorkerPool = async () => {
  await pool.destroy()
}
