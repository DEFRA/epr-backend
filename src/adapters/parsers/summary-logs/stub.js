/** @typedef {import('#domain/summary-logs/parser/port.js').SummaryLogsParser} SummaryLogsParser */

/**
 * @returns {SummaryLogsParser}
 */
export const createSummaryLogsParser = () => {
  return {
    parse: async (summaryLogBuffer) => {
      return {
        meta: {
          REGISTRATION_NUMBER: {
            value: 'reg-456',
            location: { sheet: 'Data', row: 1, column: 'B' }
          }
        },
        data: {}
      }
    }
  }
}
