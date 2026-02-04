import {
  PROCESSING_STATUSES,
  SUBMISSION_PROCESSING_STATUSES,
  SUMMARY_LOG_STATUS,
  transitionStatus
} from './status.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */

/**
 * Marks a summary log as validation_failed if it's still in a processing state.
 * Used as a "safety net" when processing fails unexpectedly.
 *
 * @param {string} summaryLogId
 * @param {SummaryLogsRepository} repository
 * @param {object} logger
 * @returns {Promise<void>}
 */
export const markAsValidationFailed = async (
  summaryLogId,
  repository,
  logger
) => {
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
 * Used as a "safety net" when processing fails unexpectedly.
 *
 * @param {string} summaryLogId
 * @param {SummaryLogsRepository} repository
 * @param {object} logger
 * @returns {Promise<void>}
 */
export const markAsSubmissionFailed = async (
  summaryLogId,
  repository,
  logger
) => {
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
