/**
 * Creates an in-memory summary log extractor for testing
 *
 * @param {Object} [options]
 * @param {Object} [options.parsed] - The parsed data to return
 * @returns {{ extract: (summaryLog: any) => Promise<Object> }}
 */
export const createSummaryLogExtractor = (options = {}) => {
  const { parsed = { meta: {}, data: {} } } = options

  return {
    extract: async (_summaryLog) => parsed
  }
}
