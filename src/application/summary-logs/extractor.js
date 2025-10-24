/** @typedef {import('#domain/uploads/repository/port.js').UploadsRepository} UploadsRepository */
/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */
/** @typedef {import('#domain/summary-logs/parser/port.js').SummaryLogsParser} SummaryLogsParser */

/**
 * SummaryLogExtractor class that handles extraction of summary log files
 */
export class SummaryLogExtractor {
  /**
   * @param {Object} params
   * @param {UploadsRepository} params.uploadsRepository
   * @param {SummaryLogsParser} params.summaryLogsParser
   */
  constructor({ uploadsRepository, summaryLogsParser }) {
    this.uploadsRepository = uploadsRepository
    this.summaryLogsParser = summaryLogsParser
  }

  /**
   * @param {SummaryLog} summaryLog
   * @returns {Promise<Object>}
   */
  async extract(summaryLog) {
    const {
      file: {
        s3: { bucket, key }
      }
    } = summaryLog

    const summaryLogBuffer = await this.uploadsRepository.findByLocation({
      bucket,
      key
    })

    if (!summaryLogBuffer) {
      throw new Error('Something went wrong while retrieving your file upload')
    }

    return this.summaryLogsParser.parse(summaryLogBuffer)
  }
}
