import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSummaryLogExtractor } from './extractor.js'
import { parse } from '#adapters/parsers/summary-logs/exceljs-parser.js'

vi.mock(
  '#adapters/parsers/summary-logs/exceljs-parser.js',
  async (importOriginal) => {
    const actual = await importOriginal()
    return {
      ...actual,
      parse: vi.fn()
    }
  }
)

describe('SummaryLogExtractor', () => {
  let uploadsRepository
  let logger
  let summaryLogExtractor
  let summaryLog

  beforeEach(() => {
    vi.mocked(parse).mockResolvedValue({
      meta: {},
      data: {}
    })

    uploadsRepository = {
      findByLocation: vi
        .fn()
        .mockResolvedValue(Buffer.from('mock file content'))
    }

    logger = {
      info: vi.fn()
    }

    summaryLogExtractor = createSummaryLogExtractor({
      uploadsRepository,
      logger
    })

    summaryLog = {
      file: {
        uri: 's3://test-bucket/test-key'
      }
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch file from uploads repository', async () => {
    await summaryLogExtractor.extract(summaryLog)

    expect(uploadsRepository.findByLocation).toHaveBeenCalledWith(
      's3://test-bucket/test-key'
    )
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

  it('should parse the file buffer with summary log options', async () => {
    const buffer = Buffer.from('test content')
    uploadsRepository.findByLocation.mockResolvedValue(buffer)

    await summaryLogExtractor.extract(summaryLog)

    expect(parse).toHaveBeenCalledWith(buffer, {
      requiredWorksheet: 'Cover',
      maxWorksheets: 20,
      maxRowsPerSheet: 55_000,
      maxColumnsPerSheet: 1_000,
      unfilledValues: expect.objectContaining({
        EWC_CODE: ['Choose option'],
        DESCRIPTION_WASTE: ['Choose option'],
        WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: ['Choose option'],
        BAILING_WIRE_PROTOCOL: ['Choose option'],
        HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: ['Choose option']
      }),
      metaPlaceholders: {
        MATERIAL: 'Choose material'
      }
    })
  })

  it('should return parsed data', async () => {
    const parsedData = {
      meta: {
        foo: { value: 'bar', location: { sheet: 'S1', row: 1, column: 'A' } }
      },
      data: {
        baz: {
          headers: ['col'],
          rows: [[123]],
          location: { sheet: 'S1', row: 2, column: 'A' }
        }
      }
    }
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

  it('should log parsing summary with metadata and data tables', async () => {
    const parsedData = {
      meta: {
        DateSubmitted: {
          value: '2024-01-15',
          location: { sheet: 'Sheet1', row: 1, column: 'B' }
        }
      },
      data: {
        OrganisationDetails: {
          headers: ['Name', 'Type'],
          rows: [
            ['Acme Corp', 'Producer'],
            ['Widget Ltd', 'Retailer']
          ],
          location: { sheet: 'Sheet1', row: 5, column: 'A' }
        }
      }
    }
    vi.mocked(parse).mockResolvedValueOnce(parsedData)

    await summaryLogExtractor.extract(summaryLog)

    expect(logger.info).toHaveBeenCalledWith(
      {
        event: {
          action: 'summary-log-parsed',
          category: 'file-processing'
        }
      },
      'Summary log parsing completed: %d metadata entries, %d data tables',
      1,
      1
    )

    expect(logger.info).toHaveBeenCalledWith(
      {
        event: {
          action: 'metadata-parsed',
          category: 'file-processing'
        }
      },
      'Metadata: %s = %s (at %s:%d:%s)',
      'DateSubmitted',
      '2024-01-15',
      'Sheet1',
      1,
      'B'
    )

    expect(logger.info).toHaveBeenCalledWith(
      {
        event: {
          action: 'data-table-parsed',
          category: 'file-processing'
        }
      },
      'Data table: %s - %d headers, %d rows (at %s:%d:%s)',
      'OrganisationDetails',
      2,
      2,
      'Sheet1',
      5,
      'A'
    )
  })

  it('should log parsing summary with empty data', async () => {
    const parsedData = {
      meta: {},
      data: {}
    }
    vi.mocked(parse).mockResolvedValueOnce(parsedData)

    await summaryLogExtractor.extract(summaryLog)

    expect(logger.info).toHaveBeenCalledWith(
      {
        event: {
          action: 'summary-log-parsed',
          category: 'file-processing'
        }
      },
      'Summary log parsing completed: %d metadata entries, %d data tables',
      0,
      0
    )
  })

  it('should handle data table with no rows', async () => {
    const parsedData = {
      meta: {},
      data: {
        EmptyTable: {
          headers: ['Column1', 'Column2'],
          rows: [],
          location: { sheet: 'Sheet1', row: 1, column: 'A' }
        }
      }
    }
    vi.mocked(parse).mockResolvedValueOnce(parsedData)

    await summaryLogExtractor.extract(summaryLog)

    expect(logger.info).toHaveBeenCalledWith(
      {
        event: {
          action: 'data-table-parsed',
          category: 'file-processing'
        }
      },
      'Data table: %s - %d headers, %d rows (at %s:%d:%s)',
      'EmptyTable',
      2,
      0,
      'Sheet1',
      1,
      'A'
    )
  })

  it('should handle data table with only one row', async () => {
    const parsedData = {
      meta: {},
      data: {
        SingleRowTable: {
          headers: ['Column1', 'Column2'],
          rows: [['Example1', 'Example2']],
          location: { sheet: 'Sheet1', row: 1, column: 'A' }
        }
      }
    }
    vi.mocked(parse).mockResolvedValueOnce(parsedData)

    await summaryLogExtractor.extract(summaryLog)

    expect(logger.info).toHaveBeenCalledWith(
      {
        event: {
          action: 'data-table-parsed',
          category: 'file-processing'
        }
      },
      'Data table: %s - %d headers, %d rows (at %s:%d:%s)',
      'SingleRowTable',
      2,
      1,
      'Sheet1',
      1,
      'A'
    )
  })
})
