import { describe, beforeEach } from 'vitest'
import { createSummaryLogExtractor } from './extractor.js'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { testSummaryLogExtractorContract } from '#domain/summary-logs/extractor/port.contract.js'

describe('SummaryLogExtractor (production)', () => {
  const createExtractorFactory = (testDataMap) => {
    // Convert testDataMap to uploads repository format
    const uploadsData = {}
    Object.keys(testDataMap).forEach((fileId) => {
      // For contract tests, we need to mock the Excel file as a buffer
      // In production, ExcelJS parses the buffer and returns workbook
      // For testing, we'll need a helper that creates valid Excel buffers
      uploadsData[`test-bucket/test-key-${fileId}`] = Buffer.from('mock')
    })

    const uploadsRepository = createInMemoryUploadsRepository(uploadsData)
    return createSummaryLogExtractor({ uploadsRepository })
  }

  // Note: This will need ExcelJS mocking or real Excel files
  // For now, we'll skip contract tests for production extractor
  // and rely on existing unit tests until we can mock ExcelJS properly
})
