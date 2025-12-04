import { describe } from 'vitest'
import { createInMemorySummaryLogExtractor } from './extractor-inmemory.js'
import { testSummaryLogExtractorContract } from '#domain/summary-logs/extractor/port.contract.js'

describe('InMemorySummaryLogExtractor', () => {
  testSummaryLogExtractorContract(createInMemorySummaryLogExtractor)
})
