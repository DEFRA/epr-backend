import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */
/** @typedef {import('#domain/summary-logs/status.js').SummaryLogStatus} SummaryLogStatus */
/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('./extractor.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('./updater.js').SummaryLogUpdater} SummaryLogUpdater */

/**
 * SummaryLogsValidator class that handles validation of summary log files
 */
export class SummaryLogsValidator {
  /**
   * @param {Object} params
   * @param {SummaryLogsRepository} params.summaryLogsRepository
   * @param {SummaryLogExtractor} params.summaryLogExtractor
   * @param {SummaryLogUpdater} params.summaryLogUpdater
   */
  constructor({
    summaryLogsRepository,
    summaryLogExtractor,
    summaryLogUpdater
  }) {
    this.summaryLogsRepository = summaryLogsRepository
    this.summaryLogExtractor = summaryLogExtractor
    this.summaryLogUpdater = summaryLogUpdater
  }

  /**
   * @param {string} summaryLogId
   * @returns {Promise<void>}
   */
  async validate(summaryLogId) {
    const result = await this.summaryLogsRepository.findById(summaryLogId)

    if (!result) {
      throw new Error(`Summary log not found: summaryLogId=${summaryLogId}`)
    }

    const { version, summaryLog } = result
    const {
      file: { id: fileId, name: filename }
    } = summaryLog

    const msg = `summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}`

    logger.info({
      message: `Summary log validation started: ${msg}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.START_SUCCESS
      }
    })

    try {
      await this.summaryLogExtractor.extract(summaryLog)

      logger.info({
        message: `Extracted summary log file: ${msg}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
        }
      })

      await this.summaryLogUpdater.update({
        id: summaryLogId,
        version,
        summaryLog,
        status: SUMMARY_LOG_STATUS.VALIDATED
      })

      logger.info({
        message: `Summary log updated: ${msg}, status=${SUMMARY_LOG_STATUS.VALIDATED}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
        }
      })
    } catch (error) {
      logger.error({
        error,
        message: `Failed to extract summary log file: ${msg}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
        }
      })

      await this.summaryLogUpdater.update({
        id: summaryLogId,
        version,
        summaryLog,
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: error.message
      })

      logger.info({
        message: `Summary log updated: ${msg}, status=${SUMMARY_LOG_STATUS.INVALID}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
        }
      })

      throw error
    }
  }
}
