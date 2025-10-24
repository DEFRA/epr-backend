/** @typedef {import('./extractor.js').SummaryLogExtractor} SummaryLogExtractor */

/**
 * Creates an in-memory summary log extractor for testing
 *
 * @param {Object} [options]
 * @param {Object} [options.parsed] - The parsed data to return
 * @returns {SummaryLogExtractor}
 */
export const createSummaryLogExtractor = (options = {}) => {
  const { parsed = { meta: {}, data: {} } } = options

  return {
    extract: async (_summaryLog) => parsed
  }
}
