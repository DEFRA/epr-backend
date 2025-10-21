/** @typedef {import('#domain/summary-logs/parser/port.js').SummaryLogsParser} SummaryLogsParser */

/**
 * @returns {SummaryLogsParser}
 */
export const createSummaryLogsParser = () => {
  return {
    parse: async (summaryLogBuffer) => {
      return summaryLogBuffer.toString('utf8')
    }
  }
}
