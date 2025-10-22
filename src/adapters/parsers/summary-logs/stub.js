/** @typedef {import('#domain/summary-logs/parser/port.js').SummaryLogsParser} SummaryLogsParser */

/**
 * @returns {SummaryLogsParser}
 */
export const createSummaryLogsParser = () => {
  return {
    parse: async ({ summaryLog, buffer }) => {
      return buffer.toString('utf8')
    }
  }
}
