import { describe, beforeEach } from 'vitest'
import { createSummaryLogExtractor } from './extractor.js'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { testSummaryLogExtractorContract } from '#domain/summary-logs/extractor/port.contract.js'

describe('SummaryLogExtractor (production)', () => {
  const createExtractorFactory = (testDataMap) => {
    // Convert testDataMap to uploads repository format
    const uploadsData = {}
    Object.keys(testDataMap).forEach((fileId) => {
      // TODO: Use real Excel files for contract testing when available
      // For now, using mock buffers - production extractor tested via unit tests
      uploadsData[`test-bucket/test-key-${fileId}`] = Buffer.from('mock')
    })

    const uploadsRepository = createInMemoryUploadsRepository(uploadsData)
    return createSummaryLogExtractor({ uploadsRepository })
  }

  // TODO: Enable contract tests when real Excel test files are available
  // For now, production extractor is tested via existing unit tests
})
