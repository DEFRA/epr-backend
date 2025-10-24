import { describe, it, expect } from 'vitest'

const testSuccessExtraction = (extractorFactory) => {
  describe('successful extraction', () => {
    it('should return parsed structure with meta and data', async () => {
      const fileId = 'test-file-123'
      const parsedData = {
        meta: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          }
        },
        data: {}
      }

      const extractor = extractorFactory({
        [fileId]: parsedData
      })

      const summaryLog = {
        file: {
          id: fileId,
          s3: { bucket: 'test-bucket', key: 'test-key' }
        }
      }

      const result = await extractor.extract(summaryLog)

      expect(result).toEqual(parsedData)
      expect(result.meta.WASTE_REGISTRATION_NUMBER.value).toBe('WRN-123')
    })
  })
}

const testMissingFile = (extractorFactory) => {
  describe('missing file', () => {
    it('should throw error when file does not exist', async () => {
      const extractor = extractorFactory({})

      const summaryLog = {
        file: {
          id: 'missing-file',
          s3: { bucket: 'test-bucket', key: 'missing-key' }
        }
      }

      await expect(extractor.extract(summaryLog)).rejects.toThrow(
        'Something went wrong while retrieving your file upload'
      )
    })
  })
}

export const testSummaryLogExtractorContract = (extractorFactory) => {
  describe('summary log extractor contract', () => {
    testSuccessExtraction(extractorFactory)
    testMissingFile(extractorFactory)
  })
}
