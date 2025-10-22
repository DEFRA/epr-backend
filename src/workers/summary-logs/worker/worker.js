import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#domain/uploads/repository/port.js').UploadsRepository} UploadsRepository */
/** @typedef {import('#domain/summary-logs/parser/port.js').SummaryLogsParser} SummaryLogsParser */
/** @typedef {import('#domain/summary-logs/status.js').SummaryLogStatus} SummaryLogStatus */

/**
 * @param {Object} params
 * @param {UploadsRepository} params.uploadsRepository
 * @param {Object} params.summaryLog
 * @param {string} params.msg
 */
const fetchSummaryLog = async ({ uploadsRepository, summaryLog, msg }) => {
  const {
    file: {
      s3: { bucket: s3Bucket, key: s3Key }
    }
  } = summaryLog

  const summaryLogBuffer = await uploadsRepository.findByLocation({
    bucket: s3Bucket,
    key: s3Key
  })

  if (summaryLogBuffer) {
    logger.info({
      message: `Fetched summary log file: ${msg}, s3Path=${s3Bucket}/${s3Key}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
      }
    })
  } else {
    logger.warn({
      message: `Failed to fetch summary log file: ${msg}, s3Path=${s3Bucket}/${s3Key}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
  }

  return summaryLogBuffer
}

/**
 * @param {Object} params
 * @param {SummaryLogsParser} params.summaryLogsParser
 * @param {Buffer} params.summaryLogBuffer
 * @param {string} params.msg
 */
const parseSummaryLog = async ({
  summaryLogsParser,
  summaryLogBuffer,
  msg
}) => {
  const parsed = await summaryLogsParser.parse(summaryLogBuffer)

  logger.info({
    message: `Parsed summary log file: ${msg}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.WORKER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return parsed
}

/**
 * @param {Object} params
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {string} params.id
 * @param {number} params.version
 * @param {Object} params.summaryLog
 * @param {SummaryLogStatus} params.status
 * @param {string|undefined|null} [params.failureReason]
 * @param {string} params.msg
 */
const updateSummaryLog = async ({
  summaryLogsRepository,
  id,
  version,
  summaryLog,
  status,
  failureReason,
  msg
}) => {
  const { failureReason: existingFailureReason } = summaryLog

  const updates = { status, failureReason }

  if (existingFailureReason && status === SUMMARY_LOG_STATUS.VALIDATED) {
    updates.failureReason = null
  }

  await summaryLogsRepository.update(id, version, updates)

  logger.info({
    message: `Summary log updated: ${msg}, status=${status}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.WORKER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}

/**
 * @param {Object} params
 * @param {UploadsRepository} params.uploadsRepository
 * @param {SummaryLogsParser} params.summaryLogsParser
 * @param {SummaryLogsRepository} params.summaryLogsRepository
 * @param {string} params.id
 * @param {number} params.version
 * @param {Object} params.summaryLog
 */
export const summaryLogsValidatorWorker = async ({
  uploadsRepository,
  summaryLogsParser,
  summaryLogsRepository,
  id,
  version,
  summaryLog
}) => {
  const {
    file: { id: fileId, name: filename }
  } = summaryLog

  const msg = `summaryLogId=${id}, fileId=${fileId}, filename=${filename}`

  logger.info({
    message: `Summary log validation worker started: ${msg}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.WORKER,
      action: LOGGING_EVENT_ACTIONS.START_SUCCESS
    }
  })

  try {
    const summaryLogBuffer = await fetchSummaryLog({
      uploadsRepository,
      summaryLog,
      msg
    })

    if (!summaryLogBuffer) {
      throw new Error('Something went wrong while retrieving your file upload')
    }

    await parseSummaryLog({
      summaryLogsParser,
      summaryLogBuffer,
      msg
    })

    await updateSummaryLog({
      summaryLogsRepository,
      id,
      version,
      summaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED,
      msg
    })
  } catch (error) {
    logger.error({
      error,
      message: `Failed to process summary log file: ${msg}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    await updateSummaryLog({
      summaryLogsRepository,
      id,
      version,
      summaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: error.message,
      msg
    })

    throw error
  }
}
