import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'

import { ExcelJSSummaryLogsParser } from './exceljs-parser.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

describe('ExcelJSSummaryLogsParser', () => {
  let parser

  /**
   * Populates a worksheet from a 2D array where each sub-array represents a row.
   * This makes the sheet layout immediately visible in tests.
   *
   * @param {Object} worksheet - ExcelJS worksheet to populate
   * @param {Array<Array>} rows - 2D array where rows[0] is row 1, rows[1] is row 2, etc.
   */
  const populateSheet = (worksheet, rows) => {
    rows.forEach((rowData, index) => {
      worksheet.getRow(index + 1).values = rowData
    })
  }

  const parseSheet = async (rows) => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Test')
    populateSheet(sheet, rows)
    const buffer = await workbook.xlsx.writeBuffer()
    return parser.parse(buffer)
  }

  beforeEach(() => {
    parser = new ExcelJSSummaryLogsParser()
  })

  describe('columnToLetter', () => {
    it('converts column 1 to A', () => {
      expect(parser.columnToLetter(1)).toBe('A')
    })

    it('converts column 26 to Z', () => {
      expect(parser.columnToLetter(26)).toBe('Z')
    })

    it('converts column 27 to AA', () => {
      expect(parser.columnToLetter(27)).toBe('AA')
    })
  })

  describe('letterToColumnNumber', () => {
    it('converts A to column 1', () => {
      expect(parser.letterToColumnNumber('A')).toBe(1)
    })

    it('converts Z to column 26', () => {
      expect(parser.letterToColumnNumber('Z')).toBe(26)
    })

    it('converts AA to column 27', () => {
      expect(parser.letterToColumnNumber('AA')).toBe(27)
    })

    it.each(['', 'a', 'aa', 'Ab', '123', 'A1', '@#$'])(
      'throws error for invalid input: %s',
      (input) => {
        expect(() => parser.letterToColumnNumber(input)).toThrow(
          'Invalid column letter: must be uppercase only'
        )
      }
    )
  })

  describe('sheet with no markers', () => {
    it('should return empty metadata and data', async () => {
      const excelBuffer = await readFile(
        path.join(dirname, '../../../data/fixtures/uploads/reprocessor.xlsx')
      )
      const result = await parser.parse(excelBuffer)

      expect(result).toBeDefined()
      expect(result.meta).toBeDefined()
      expect(result.meta).toEqual({})
      expect(result.data).toBeDefined()
      expect(result.data).toEqual({})
    })
  })

  it('should throw error for invalid Excel buffer', async () => {
    const invalidBuffer = Buffer.from('not an excel file')

    await expect(parser.parse(invalidBuffer)).rejects.toThrow()
  })

  it('should handle empty buffer', async () => {
    const emptyBuffer = Buffer.from('')

    await expect(parser.parse(emptyBuffer)).rejects.toThrow()
  })

  describe('marker-based parsing', () => {
    it('should extract single metadata marker', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Sheet1')

      populateSheet(worksheet, [['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR']])

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

      expect(result.meta).toEqual({
        PROCESSING_TYPE: {
          value: 'REPROCESSOR',
          location: { sheet: 'Sheet1', row: 1, column: 'B' }
        }
      })
    })

    it('extracts multiple metadata markers', async () => {
      const result = await parseSheet([
        ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR'],
        ['__EPR_META_MATERIAL', 'Paper and board']
      ])

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR',
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Test', row: 2, column: 'B' }
      })
    })

    it('extracts data section headers', async () => {
      const result = await parseSheet([
        ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED']
      ])

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: []
      })
    })

    it('extracts data section headers ending with empty cell', async () => {
      const result = await parseSheet([
        [
          '__EPR_DATA_UPDATE_WASTE_BALANCE',
          'OUR_REFERENCE',
          'DATE_RECEIVED',
          '',
          'IGNORED'
        ]
      ])

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: []
      })
    })

    it('extracts data section with rows', async () => {
      const result = await parseSheet([
        ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
        [null, 12345678910, '2025-05-25'],
        [null, 98765432100, '2025-05-26']
      ])

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [
          [12345678910, '2025-05-25'],
          [98765432100, '2025-05-26']
        ]
      })
    })

    it('extracts data section terminated by empty row', async () => {
      const result = await parseSheet([
        ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
        [null, 12345678910, '2025-05-25'],
        [null, '', ''],
        [null, 'This should be ignored']
      ])

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [[12345678910, '2025-05-25']]
      })
    })

    it('handles side-by-side data sections without cross-contamination', async () => {
      const result = await parseSheet([
        [
          '__EPR_DATA_TABLE_ONE',
          'REF_ONE',
          'DATE_ONE',
          '',
          '__EPR_DATA_TABLE_TWO',
          'REF_TWO',
          'DATE_TWO'
        ],
        [null, 'ABC123', '2025-01-01', null, null, 'XYZ789', '2025-02-02'],
        [null, '', '', null, null, '', '']
      ])

      expect(result.data.TABLE_ONE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['REF_ONE', 'DATE_ONE'],
        rows: [['ABC123', '2025-01-01']]
      })

      expect(result.data.TABLE_TWO).toEqual({
        location: { sheet: 'Test', row: 1, column: 'F' },
        headers: ['REF_TWO', 'DATE_TWO'],
        rows: [['XYZ789', '2025-02-02']]
      })
    })

    it('transitions collection from HEADERS to ROWS state correctly', async () => {
      const result = await parseSheet([
        ['__EPR_DATA_TRANSITION_TEST', 'HEADER_ONE', 'HEADER_TWO'],
        [null, 'row1_col1', 'row1_col2'],
        [null, '', '']
      ])

      expect(result.data.TRANSITION_TEST).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['HEADER_ONE', 'HEADER_TWO'],
        rows: [['row1_col1', 'row1_col2']]
      })

      expect(result.data.TRANSITION_TEST.rows).toHaveLength(1)
    })

    it('handles skip column markers', async () => {
      const result = await parseSheet([
        [
          '__EPR_DATA_WASTE_RECEIVED',
          'OUR_REFERENCE',
          'DATE_RECEIVED',
          '__EPR_SKIP_COLUMN',
          'SUPPLIER_REF',
          'SUPPLIER_NAME'
        ],
        [null, 12345678910, '2025-05-25', null, 'ABC123', 'Joe Blogs']
      ])

      expect(result.data.WASTE_RECEIVED).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: [
          'OUR_REFERENCE',
          'DATE_RECEIVED',
          null,
          'SUPPLIER_REF',
          'SUPPLIER_NAME'
        ],
        rows: [[12345678910, '2025-05-25', null, 'ABC123', 'Joe Blogs']]
      })
    })

    it('handles sparse data with missing cells', async () => {
      const result = await parseSheet([
        ['__EPR_DATA_SPARSE', 'COL_A', 'COL_B', 'COL_C'],
        [null, 'A1', null, 'C1'] // C2 is empty - intentionally null
      ])

      expect(result.data.SPARSE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['COL_A', 'COL_B', 'COL_C'],
        rows: [['A1', null, 'C1']]
      })
    })

    it('handles realistic structure with metadata, skip columns, and sparse data', async () => {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Summary')

      populateSheet(sheet, [
        // Metadata section
        ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR'],
        ['__EPR_META_MATERIAL', 'Paper and board'],
        // Blank row
        [],
        // Data section
        [
          '__EPR_DATA_UPDATE_WASTE_BALANCE',
          'OUR_REFERENCE',
          'DATE_RECEIVED',
          '__EPR_SKIP_COLUMN',
          'SUPPLIER_REF',
          'SUPPLIER_NAME'
        ],
        [null, 12345678910, '2025-05-25', null, 'ABC123', 'Joe Bloggs'],
        [null, 98765432100, '2025-05-26', null, null, 'Jane Smith']
      ])

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR',
        location: { sheet: 'Summary', row: 1, column: 'B' }
      })
      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Summary', row: 2, column: 'B' }
      })
      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Summary', row: 4, column: 'B' },
        headers: [
          'OUR_REFERENCE',
          'DATE_RECEIVED',
          null,
          'SUPPLIER_REF',
          'SUPPLIER_NAME'
        ],
        rows: [
          [12345678910, '2025-05-25', null, 'ABC123', 'Joe Bloggs'],
          [98765432100, '2025-05-26', null, null, 'Jane Smith']
        ]
      })
    })
  })

  describe('multiple worksheets', () => {
    it('should parse metadata from multiple sheets', async () => {
      const workbook = new ExcelJS.Workbook()

      const sheet1 = workbook.addWorksheet('Sheet1')
      populateSheet(sheet1, [['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR']])

      const sheet2 = workbook.addWorksheet('Sheet2')
      populateSheet(sheet2, [['__EPR_META_MATERIAL', 'Paper and board']])

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR',
        location: { sheet: 'Sheet1', row: 1, column: 'B' }
      })
      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Sheet2', row: 1, column: 'B' }
      })
    })

    it('should merge metadata and data sections from multiple worksheets', async () => {
      const workbook = new ExcelJS.Workbook()

      const sheet1 = workbook.addWorksheet('Sheet1')
      populateSheet(sheet1, [
        ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR'],
        [],
        ['__EPR_DATA_WASTE_BALANCE', 'OUR_REFERENCE', 'WEIGHT'],
        [null, 12345, 100],
        [null, 67890, 200]
      ])

      const sheet2 = workbook.addWorksheet('Sheet2')
      populateSheet(sheet2, [
        ['__EPR_META_MATERIAL', 'Paper and board'],
        [],
        ['__EPR_DATA_SUPPLIER_INFO', 'SUPPLIER_NAME', 'SUPPLIER_REF'],
        [null, 'ABC Ltd', 'ABC123'],
        [null, 'XYZ Corp', 'XYZ789']
      ])

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR',
        location: { sheet: 'Sheet1', row: 1, column: 'B' }
      })
      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Sheet2', row: 1, column: 'B' }
      })

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Sheet1', row: 3, column: 'B' },
        headers: ['OUR_REFERENCE', 'WEIGHT'],
        rows: [
          [12345, 100],
          [67890, 200]
        ]
      })

      expect(result.data.SUPPLIER_INFO).toEqual({
        location: { sheet: 'Sheet2', row: 3, column: 'B' },
        headers: ['SUPPLIER_NAME', 'SUPPLIER_REF'],
        rows: [
          ['ABC Ltd', 'ABC123'],
          ['XYZ Corp', 'XYZ789']
        ]
      })
    })
  })

  describe('metadata marker in value position', () => {
    it('should throw error when marker appears where value should be', async () => {
      const result = parseSheet([
        ['__EPR_META_TYPE', '__EPR_META_NAME', 'name value']
      ])

      await expect(result).rejects.toThrow(
        'Malformed sheet: metadata marker found in value position'
      )
    })
  })

  describe('multiple metadata markers on same row', () => {
    it('should record both markers when separated by null value', async () => {
      const result = await parseSheet([
        ['__EPR_META_TYPE', null, '__EPR_META_NAME', 'name value']
      ])

      expect(result.meta.TYPE).toEqual({
        value: null,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
      expect(result.meta.NAME).toEqual({
        value: 'name value',
        location: { sheet: 'Test', row: 1, column: 'D' }
      })
    })
  })

  describe('multiple data sections with same name', () => {
    it('should throw error for duplicate data section names', async () => {
      const result = parseSheet([
        ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
        [null, 12345, '2025-05-25'],
        [null, '', ''],
        [],
        ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'SUPPLIER_REF', 'WEIGHT'],
        [null, 'ABC123', 100],
        [null, '', '']
      ])

      await expect(result).rejects.toThrow(
        'Duplicate data section name: UPDATE_WASTE_BALANCE'
      )
    })
  })

  describe('duplicate metadata markers', () => {
    it('should throw error for duplicate metadata marker names', async () => {
      const result = parseSheet([
        ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR'],
        ['__EPR_META_MATERIAL', 'Paper and board'],
        ['__EPR_META_PROCESSING_TYPE', 'EXPORTER']
      ])

      await expect(result).rejects.toThrow(
        'Duplicate metadata name: PROCESSING_TYPE'
      )
    })
  })

  describe('data section without empty row terminator', () => {
    it('should emit data section that goes to last row without empty terminator', async () => {
      const result = await parseSheet([
        ['__EPR_DATA_WASTE_RECEIVED', 'OUR_REFERENCE', 'DATE_RECEIVED'],
        [null, 12345678910, '2025-05-25'],
        [null, 98765432100, '2025-05-26'],
        [null, 11122233344, '2025-05-27']
      ])

      expect(result.data.WASTE_RECEIVED).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [
          [12345678910, '2025-05-25'],
          [98765432100, '2025-05-26'],
          [11122233344, '2025-05-27']
        ]
      })
    })
  })

  describe('empty/null metadata values', () => {
    it('should store empty string when metadata marker is followed by empty string cell', async () => {
      const result = await parseSheet([['__EPR_META_PROCESSING_TYPE', '']])

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: '',
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should store null when metadata marker is followed by explicitly null cell', async () => {
      const result = await parseSheet([
        ['__EPR_META_MATERIAL', null, 'extra to ensure B2 is visited']
      ])

      expect(result.meta.MATERIAL).toEqual({
        value: null,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })
  })

  describe('markers not in column A', () => {
    it('should extract metadata marker and value from correct positions when not in column A', async () => {
      const result = await parseSheet([
        [null, null, '__EPR_META_PROCESSING_TYPE', 'REPROCESSOR'],
        [null, '__EPR_META_MATERIAL', 'Paper and board']
      ])

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR',
        location: { sheet: 'Test', row: 1, column: 'D' }
      })
      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Test', row: 2, column: 'C' }
      })
    })

    it('should extract data section with correct startColumn when marker not in column A', async () => {
      const result = await parseSheet([
        [null, '__EPR_DATA_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
        [null, null, 12345678910, '2025-05-25'],
        [null, null, 98765432100, '2025-05-26']
      ])

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'C' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [
          [12345678910, '2025-05-25'],
          [98765432100, '2025-05-26']
        ]
      })
    })

    it('should handle mixed placement of metadata and data markers', async () => {
      const result = await parseSheet([
        [null, null, '__EPR_META_TYPE', 'REPROCESSOR'],
        [],
        [
          null,
          null,
          '__EPR_DATA_SECTION_ONE',
          'HEADER_A',
          'HEADER_B',
          null,
          '__EPR_DATA_SECTION_TWO',
          'HEADER_X'
        ],
        [null, null, null, 'value_a1', 'value_b1', null, null, 'value_x1'],
        [null, null, null, '', '', null, null, '']
      ])

      expect(result.meta.TYPE).toEqual({
        value: 'REPROCESSOR',
        location: { sheet: 'Test', row: 1, column: 'D' }
      })

      expect(result.data.SECTION_ONE).toEqual({
        location: { sheet: 'Test', row: 3, column: 'D' },
        headers: ['HEADER_A', 'HEADER_B'],
        rows: [['value_a1', 'value_b1']]
      })

      expect(result.data.SECTION_TWO).toEqual({
        location: { sheet: 'Test', row: 3, column: 'H' },
        headers: ['HEADER_X'],
        rows: [['value_x1']]
      })
    })
  })

  describe('rows with more cells than headers', () => {
    it('should ignore extra cells beyond the number of headers', async () => {
      const result = await parseSheet([
        ['__EPR_DATA_WASTE_BALANCE', 'HEADER_A', 'HEADER_B', 'HEADER_C'],
        [null, 'value_a1', 'value_b1', 'value_c1', 'extra_1', 'extra_2'],
        [null, 'value_a2', 'value_b2', 'value_c2', 'extra_3']
      ])

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['HEADER_A', 'HEADER_B', 'HEADER_C'],
        rows: [
          ['value_a1', 'value_b1', 'value_c1'],
          ['value_a2', 'value_b2', 'value_c2']
        ]
      })
    })
  })
})
