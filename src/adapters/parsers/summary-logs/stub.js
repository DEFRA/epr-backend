/** @typedef {import('#domain/summary-logs/parser/port.js').SummaryLogsParser} SummaryLogsParser */

/**
 * @returns {SummaryLogsParser}
 */
export const createSummaryLogsParser = () => {
  return {
    parse: async (summaryLogBuffer) => {
      return Buffer.from(summaryLogBuffer, 'utf8').toString('utf8')
    }
  }
}
