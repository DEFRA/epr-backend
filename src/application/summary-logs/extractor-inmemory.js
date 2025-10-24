import { SummaryLogExtractor } from './extractor.js'

/**
 * Creates an in-memory summary log extractor for testing
 *
 * @param {Object} [options]
 * @param {Object} [options.parsed] - The parsed data to return
 * @returns {SummaryLogExtractor}
 */
export const createSummaryLogExtractor = (options = {}) => {
  const { parsed = { meta: {}, data: {} } } = options

  const mockUploadsRepository = {
    findByLocation: async () => null
  }

  const mockParser = {
    parse: async () => parsed
  }

  return new SummaryLogExtractor({
    uploadsRepository: mockUploadsRepository,
    summaryLogsParser: mockParser
  })
}
