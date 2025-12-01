import { produce } from 'immer'

/** @typedef {import('#domain/summary-logs/extractor/port.js').SummaryLogExtractor} SummaryLogExtractor */
/** @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog */
/** @typedef {import('#domain/summary-logs/model.js').SummaryLog} SummaryLog */

/**
 * Creates an in-memory summary log extractor for testing
 * @param {Object.<string, ParsedSummaryLog>} testDataMap - Map of file IDs to parsed data
 * @returns {SummaryLogExtractor}
 */
export const createInMemorySummaryLogExtractor = (testDataMap) => {
  return {
    /**
     * @param {SummaryLog} summaryLog
     * @returns {Promise<ParsedSummaryLog>}
     */
    extract: async (summaryLog) => {
      const {
        file: { id: fileId }
      } = summaryLog

      if (!testDataMap[fileId]) {
        throw new Error(
          'Something went wrong while retrieving your file upload'
        )
      }

      return produce(testDataMap[fileId], () => {})
    }
  }
}
