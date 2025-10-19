import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-log.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#repositories/uploads/port.js').UploadsRepository} UploadsRepository */

/**
 * @param {Object} params
 * @param {Object} params.summaryLog
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {UploadsRepository} params.uploadsRepository
 */
export const summaryLogsValidatorWorker = async ({
  summaryLogsRepository,
  uploadsRepository,
  summaryLog
}) => {
  const {
    id: summaryLogId,
    version,
    file: {
      id: fileId,
      name: filename,
      s3: { bucket, key }
    }
  } = summaryLog

  logger.info({
    message: `Summary log validation worker started: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.WORKER,
      action: LOGGING_EVENT_ACTIONS.START_SUCCESS
    }
  })

  let status = SUMMARY_LOG_STATUS.INVALID
  let failureReason

  const context = `summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, s3Path=${bucket}/${key}`

  try {
    const summaryLogBuffer = await uploadsRepository.findByLocation({
      bucket,
      key
    })

    if (summaryLogBuffer) {
      logger.info({
        message: `Fetched summary log file: ${context}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.WORKER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
        }
      })

      status = SUMMARY_LOG_STATUS.VALIDATED
    } else {
      failureReason = 'Something went wrong while retrieving your file upload'

      logger.warn({
        message: `Failed to fetch summary log file: ${context}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.WORKER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
        }
      })
    }
  } catch (error) {
    failureReason = 'Something went wrong while retrieving your file upload'

    logger.error({
      error,
      message: `Failed to fetch summary log file: ${context}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    throw error
  } finally {
    const updates = {
      status
    }

    if (failureReason) {
      updates.failureReason = failureReason
    } else if (
      summaryLog.failureReason &&
      status === SUMMARY_LOG_STATUS.VALIDATED
    ) {
      updates.failureReason = null
    }

    await summaryLogsRepository.update(summaryLogId, version, updates)

    logger.info({
      message: `Summary log updated: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=${status}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  }
}
