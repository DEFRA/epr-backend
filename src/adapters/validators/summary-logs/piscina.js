import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { Piscina } from 'piscina'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  PROCESSING_STATUSES,
  SUMMARY_LOG_COMMAND,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const ONE_MINUTE = 60_000
const FIVE_MINUTES = 5 * ONE_MINUTE

/**
 * Worker thread resource limits.
 *
 * These limits prevent a single summary log validation from consuming
 * excessive memory and crashing the container. When a worker reaches
 * these limits, it will be terminated with ERR_WORKER_OUT_OF_MEMORY,
 * which is caught and logged rather than crashing the entire service.
 *
 * Values chosen based on:
 * - AWS instance has 2GB memory (after temporary increase from 8GB)
 * - Main thread and Node.js overhead need ~256MB
 * - Leave headroom for concurrent operations
 * - 512MB should be sufficient for most valid summary logs
 */
const RESOURCE_LIMITS = {
  maxOldGenerationSizeMb: 512, // Main heap limit (V8 old generation)
  maxYoungGenerationSizeMb: 64, // Young generation for short-lived objects
  codeRangeSizeMb: 64 // JIT compiled code
}

const pool = new Piscina({
  filename: path.join(
    dirname,
    '../../../workers/summary-logs/worker/worker-thread.js'
  ),
  maxThreads: 1, // Match vCPU count on AWS instance
  idleTimeout: ONE_MINUTE,
  resourceLimits: RESOURCE_LIMITS
})

/**
 * Tracks active validation tasks by summaryLogId.
 * Maps summaryLogId -> timeoutId so we can clear the timeout when the task completes.
 * @type {Map<string, NodeJS.Timeout>}
 */
const activeTimeouts = new Map()

/** @typedef {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} SummaryLogsCommandExecutor */
/** @typedef {import('#repositories/summary-logs/index.js').SummaryLogsRepository} SummaryLogsRepository */

/**
 * Marks a summary log as validation_failed if it's still in a processing state.
 * This is a "safety net" called from the main thread when:
 *   - The worker thread crashes (promise rejects)
 *   - The worker thread hangs forever (timeout fires)
 *
 * @param {string} summaryLogId
 * @param {SummaryLogsRepository} repository - Main thread repository instance
 * @param {object} logger
 * @returns {Promise<void>}
 */
const markAsValidationFailed = async (summaryLogId, repository, logger) => {
  try {
    const result = await repository.findById(summaryLogId)

    if (!result) {
      logger.warn({
        message: `Cannot mark as validation_failed: summary log not found`,
        summaryLogId
      })
      return
    }

    const { version, summaryLog } = result

    // Only mark as validation_failed if still in a processing state
    if (!PROCESSING_STATUSES.includes(summaryLog.status)) {
      return
    }

    await repository.update(summaryLogId, version, {
      status: SUMMARY_LOG_STATUS.VALIDATION_FAILED
    })
  } catch (err) {
    logger.error({
      error: err,
      message: `Failed to mark summary log as validation_failed`,
      summaryLogId
    })
  }
}

/**
 * Clears the timeout for a given summaryLogId if one exists.
 * @param {string} summaryLogId
 */
const clearTaskTimeout = (summaryLogId) => {
  const timeoutId = activeTimeouts.get(summaryLogId)

  if (timeoutId) {
    clearTimeout(timeoutId)
    activeTimeouts.delete(summaryLogId)
  }
}

/**
 * @param {string} command
 * @param {string} summaryLogId
 * @param {object} logger
 * @param {SummaryLogsRepository | null} repository - Main thread repository for timeout tracking (only used for validate command)
 * @returns {Promise<void>}
 */
const runCommandInWorker = async (
  command,
  summaryLogId,
  logger,
  repository
) => {
  try {
    await pool.run({ command, summaryLogId })

    // Clear timeout on success - worker completed normally
    clearTaskTimeout(summaryLogId)

    logger.info({
      message: `Summary log ${command} worker completed: summaryLogId=${summaryLogId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  } catch (err) {
    // Clear timeout on failure - we'll handle it here
    clearTaskTimeout(summaryLogId)

    logger.error({
      error: err,
      message: `Summary log ${command} worker failed: summaryLogId=${summaryLogId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    // For validate command failures, mark as validation_failed
    // (submit failures will be handled differently in Phase 3)
    if (command === SUMMARY_LOG_COMMAND.VALIDATE && repository) {
      await markAsValidationFailed(summaryLogId, repository, logger)
    }
  }
}

/**
 * Creates a summary logs command executor with timeout tracking.
 *
 * @param {object} logger
 * @param {SummaryLogsRepository} [summaryLogsRepository] - Main thread repository for timeout tracking.
 *   This is NOT the same repository used inside the worker thread. The worker thread creates its own
 *   repository instance for normal status updates (e.g., validating → validated).
 *   This repository is ONLY used as a "safety net" to mark summary logs as validation_failed when
 *   the worker crashes or times out.
 * @returns {SummaryLogsCommandExecutor}
 */
export const createSummaryLogsCommandExecutor = (
  logger,
  summaryLogsRepository
) => {
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

      // Start timeout tracker - if worker hangs or crashes, we'll mark as validation_failed
      if (summaryLogsRepository) {
        const timeoutId = setTimeout(async () => {
          activeTimeouts.delete(summaryLogId)
          logger.error({
            message: `Summary log validate worker timed out: summaryLogId=${summaryLogId}`,
            summaryLogId
          })

          await markAsValidationFailed(
            summaryLogId,
            summaryLogsRepository,
            logger
          )
        }, FIVE_MINUTES)

        activeTimeouts.set(summaryLogId, timeoutId)
      }

      runCommandInWorker(
        SUMMARY_LOG_COMMAND.VALIDATE,
        summaryLogId,
        logger,
        summaryLogsRepository
      )
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

      // Submit command does not use timeout tracking (Phase 3 will handle submission failures differently)
      runCommandInWorker(SUMMARY_LOG_COMMAND.SUBMIT, summaryLogId, logger, null)
    }
  }
}

export const closeWorkerPool = async () => {
  await pool.destroy()
}
