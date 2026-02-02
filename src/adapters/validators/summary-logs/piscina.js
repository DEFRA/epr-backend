import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { Piscina } from 'piscina'

import { config } from '#root/config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  PROCESSING_STATUSES,
  SUBMISSION_PROCESSING_STATUSES,
  SUMMARY_LOG_COMMAND,
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const ONE_MINUTE = 60_000
const WORKER_TIMEOUT_MINUTES = 5
const WORKER_TIMEOUT_MS = WORKER_TIMEOUT_MINUTES * ONE_MINUTE

/**
 * Worker thread resource limits.
 *
 * These limits prevent a single summary log validation from consuming
 * excessive memory and crashing the container. When a worker reaches
 * these limits, it will be terminated with ERR_WORKER_OUT_OF_MEMORY,
 * which is caught and logged rather than crashing the entire service.
 */
const RESOURCE_LIMITS = {
  maxOldGenerationSizeMb: 1024, // Main heap limit (V8 old generation)
  maxYoungGenerationSizeMb: 128, // Young generation for short-lived objects
  codeRangeSizeMb: 64 // JIT compiled code
}

/**
 * Maximum worker threads for validation.
 * Configure via PISCINA_MAX_THREADS env var.
 * Default: 2 (suitable for 4 vCPU instances, safe on smaller instances)
 */
const maxThreads = config.get('piscina.maxThreads')

const pool = new Piscina({
  filename: path.join(
    dirname,
    '../../../workers/summary-logs/worker/worker-thread.js'
  ),
  maxThreads,
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
/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */

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

    await repository.update(
      summaryLogId,
      version,
      transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATION_FAILED)
    )
  } catch (err) {
    logger.error({
      err,
      message: `Failed to mark summary log as validation_failed`,
      summaryLogId
    })
  }
}

/**
 * Marks a summary log as submission_failed if it's still in submitting state.
 * This is a "safety net" called from the main thread when the worker thread
 * crashes (promise rejects).
 *
 * @param {string} summaryLogId
 * @param {SummaryLogsRepository} repository - Main thread repository instance
 * @param {object} logger
 * @returns {Promise<void>}
 */
const markAsSubmissionFailed = async (summaryLogId, repository, logger) => {
  try {
    const result = await repository.findById(summaryLogId)

    if (!result) {
      logger.warn({
        message: `Cannot mark as submission_failed: summary log not found`,
        summaryLogId
      })
      return
    }

    const { version, summaryLog } = result

    // Only mark as submission_failed if still in submitting state
    if (!SUBMISSION_PROCESSING_STATUSES.includes(summaryLog.status)) {
      return
    }

    await repository.update(
      summaryLogId,
      version,
      transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMISSION_FAILED)
    )
  } catch (err) {
    logger.error({
      err,
      message: `Failed to mark summary log as submission_failed`,
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
 * @param {SummaryLogsRepository | null} repository - Main thread repository for timeout tracking
 * @param {object} [user]
 * @returns {Promise<void>}
 */
const runCommandInWorker = async (
  command,
  summaryLogId,
  logger,
  repository,
  user
) => {
  try {
    await pool.run({ command, summaryLogId, user })

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
      err,
      message: `Summary log ${command} worker failed: summaryLogId=${summaryLogId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    if (repository) {
      switch (command) {
        case SUMMARY_LOG_COMMAND.VALIDATE:
          await markAsValidationFailed(summaryLogId, repository, logger)
          break
        case SUMMARY_LOG_COMMAND.SUBMIT:
          await markAsSubmissionFailed(summaryLogId, repository, logger)
          break
        /* v8 ignore next 2 */
        default:
          throw new Error(`Unknown command: ${command}`)
      }
    }
  }
}

/**
 * Creates a summary logs command executor with timeout tracking.
 *
 * @param {object} logger
 * @param {SummaryLogsRepository} summaryLogsRepository - Main thread repository for timeout tracking.
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
      }, WORKER_TIMEOUT_MS)

      activeTimeouts.set(summaryLogId, timeoutId)

      runCommandInWorker(
        SUMMARY_LOG_COMMAND.VALIDATE,
        summaryLogId,
        logger,
        summaryLogsRepository
      )
    },
    submit: async (summaryLogId, user) => {
      // Fire-and-forget: submission runs asynchronously in worker thread, request returns immediately
      // Intentionally not awaiting as the HTTP response completes before submission finishes
      logger.info({
        message: `Summary log submission worker spawning: summaryLogId=${summaryLogId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.START_SUCCESS
        }
      })

      runCommandInWorker(
        SUMMARY_LOG_COMMAND.SUBMIT,
        summaryLogId,
        logger,
        summaryLogsRepository ?? null,
        user
      )
    }
  }
}

export const closeWorkerPool = async () => {
  await pool.destroy()
}
