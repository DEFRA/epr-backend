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
  logger.info({
    message: `Summary log validation worker started: summaryLogId=${summaryLog.id}, fileId=${summaryLog.file.id}, filename=${summaryLog.file.name}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.WORKER,
      action: LOGGING_EVENT_ACTIONS.START_SUCCESS
    }
  })

  let status = SUMMARY_LOG_STATUS.INVALID
  let failureReason

  const context = `summaryLogId=${summaryLog.id}, fileId=${summaryLog.file.id}, filename=${summaryLog.file.name}, s3Path=${summaryLog.file.s3.bucket}/${summaryLog.file.s3.key}`

  try {
    const summaryLogBuffer = await uploadsRepository.findByLocation({
      bucket: summaryLog.file.s3.bucket,
      key: summaryLog.file.s3.key
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
    }

    if (summaryLog.failureReason && status === SUMMARY_LOG_STATUS.VALIDATED) {
      updates.failureReason = null
    }

    await summaryLogsRepository.update(
      summaryLog.id,
      summaryLog.version,
      updates
    )

    logger.info({
      message: `Summary log updated: summaryLogId=${summaryLog.id}, fileId=${summaryLog.file.id}, filename=${summaryLog.file.name}, status=${status}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  }
}
