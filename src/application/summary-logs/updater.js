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
   * @param {SummaryLogStatus} params.status
   * @param {string|undefined|null} [params.failureReason]
   * @returns {Promise<void>}
   */
  async update({ id, version, status, failureReason }) {
    await this.summaryLogsRepository.update(id, version, {
      status,
      failureReason
    })
  }
}
