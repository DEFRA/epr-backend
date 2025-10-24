import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */
/** @typedef {import('#domain/summary-logs/status.js').SummaryLogStatus} SummaryLogStatus */
/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */

/**
 * SummaryLogUpdater class that handles updating summary logs with business rules
 */
export class SummaryLogUpdater {
  /**
   * @param {Object} params
   * @param {SummaryLogsRepository} params.summaryLogsRepository
   */
  constructor({ summaryLogsRepository }) {
    this.summaryLogsRepository = summaryLogsRepository
  }

  /**
   * @param {Object} params
   * @param {string} params.id
   * @param {number} params.version
   * @param {SummaryLog} params.summaryLog
   * @param {SummaryLogStatus} params.status
   * @param {string|undefined|null} [params.failureReason]
   * @returns {Promise<void>}
   */
  async update({ id, version, summaryLog, status, failureReason }) {
    const { failureReason: existingFailureReason } = summaryLog

    const updates = { status, failureReason }

    if (existingFailureReason && status === SUMMARY_LOG_STATUS.VALIDATED) {
      updates.failureReason = null
    }

    await this.summaryLogsRepository.update(id, version, updates)
  }
}
