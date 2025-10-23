/** @typedef {import('#domain/summary-logs/parser/port.js').SummaryLogsParser} SummaryLogsParser */

/**
 * @param {Object} [options]
 * @param {string} [options.registrationNumber] - The registration number to return in parsed metadata
 * @returns {SummaryLogsParser}
 */
export const createSummaryLogsParser = (options = {}) => {
  const { registrationNumber } = options

  return {
    parse: async (summaryLogBuffer) => {
      const meta = {}

      if (registrationNumber !== undefined) {
        meta.REGISTRATION_NUMBER = {
          value: registrationNumber,
          location: { sheet: 'Data', row: 1, column: 'B' }
        }
      }

      return {
        meta,
        data: {}
      }
    }
  }
}
