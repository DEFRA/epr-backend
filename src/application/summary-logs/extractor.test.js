import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSummaryLogExtractor } from './extractor.js'
import { parse } from '#adapters/parsers/summary-logs/exceljs-parser.js'

vi.mock('#adapters/parsers/summary-logs/exceljs-parser.js', () => ({
  parse: vi.fn()
}))

describe('SummaryLogExtractor', () => {
  let uploadsRepository
  let summaryLogExtractor
  let summaryLog

  beforeEach(() => {
    vi.mocked(parse).mockResolvedValue({ parsed: 'data' })

    uploadsRepository = {
      findByLocation: vi
        .fn()
        .mockResolvedValue(Buffer.from('mock file content'))
    }

    summaryLogExtractor = createSummaryLogExtractor({
      uploadsRepository
    })

    summaryLog = {
      file: {
        s3: {
          bucket: 'test-bucket',
          key: 'test-key'
        }
      }
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch file from uploads repository', async () => {
    await summaryLogExtractor.extract(summaryLog)

    expect(uploadsRepository.findByLocation).toHaveBeenCalledWith({
      bucket: 'test-bucket',
      key: 'test-key'
    })
  })

  it('should throw error when file not found', async () => {
    uploadsRepository.findByLocation.mockResolvedValue(null)

    const result = await summaryLogExtractor
      .extract(summaryLog)
      .catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe(
      'Something went wrong while retrieving your file upload'
    )
  })

  it('should parse the file buffer', async () => {
    const buffer = Buffer.from('test content')
    uploadsRepository.findByLocation.mockResolvedValue(buffer)

    await summaryLogExtractor.extract(summaryLog)

    expect(parse).toHaveBeenCalledWith(buffer)
  })

  it('should return parsed data', async () => {
    const parsedData = { foo: 'bar', baz: 123 }
    vi.mocked(parse).mockResolvedValueOnce(parsedData)

    const result = await summaryLogExtractor.extract(summaryLog)

    expect(result).toEqual(parsedData)
  })

  it('should throw error if S3 fetch fails', async () => {
    uploadsRepository.findByLocation.mockRejectedValue(new Error('S3 error'))

    const result = await summaryLogExtractor
      .extract(summaryLog)
      .catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('S3 error')
  })

  it('should throw error if parsing fails', async () => {
    vi.mocked(parse).mockRejectedValueOnce(new Error('Parse error'))

    const result = await summaryLogExtractor
      .extract(summaryLog)
      .catch((err) => err)

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Parse error')
  })
})
