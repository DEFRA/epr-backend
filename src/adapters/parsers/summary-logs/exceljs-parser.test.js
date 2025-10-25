import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
      const ExcelJS = (await import('exceljs')).default
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
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Test')

      populateSheet(sheet, [
        ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR'],
        ['__EPR_META_MATERIAL', 'Paper and board']
      ])

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

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
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Test')

      populateSheet(sheet, [
        ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED']
      ])

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: []
      })
    })

    it('extracts data section headers ending with empty cell', async () => {
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Test')

      populateSheet(sheet, [
        [
          '__EPR_DATA_UPDATE_WASTE_BALANCE',
          'OUR_REFERENCE',
          'DATE_RECEIVED',
          '',
          'IGNORED'
        ]
      ])

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: []
      })
    })

    it('extracts data section with rows', async () => {
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Test')

      populateSheet(sheet, [
        ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
        [null, 12345678910, '2025-05-25'],
        [null, 98765432100, '2025-05-26']
      ])

      const buffer = await workbook.xlsx.writeBuffer()
      const parser = new ExcelJSSummaryLogsParser()
      const result = await parser.parse(buffer)

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
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Test')

      populateSheet(sheet, [
        ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
        [null, 12345678910, '2025-05-25'],
        [null, '', ''],
        [null, 'This should be ignored']
      ])

      const buffer = await workbook.xlsx.writeBuffer()
      const parser = new ExcelJSSummaryLogsParser()
      const result = await parser.parse(buffer)

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [[12345678910, '2025-05-25']]
      })
    })

    it('handles side-by-side data sections without cross-contamination', async () => {
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Test')

      populateSheet(sheet, [
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

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

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
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Test')

      populateSheet(sheet, [
        ['__EPR_DATA_TRANSITION_TEST', 'HEADER_ONE', 'HEADER_TWO'],
        [null, 'row1_col1', 'row1_col2'],
        [null, '', '']
      ])

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

      expect(result.data.TRANSITION_TEST).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['HEADER_ONE', 'HEADER_TWO'],
        rows: [['row1_col1', 'row1_col2']]
      })

      expect(result.data.TRANSITION_TEST.rows).toHaveLength(1)
    })

    it('handles skip column markers', async () => {
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Test')

      populateSheet(sheet, [
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

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

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
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Test')

      populateSheet(sheet, [
        ['__EPR_DATA_SPARSE', 'COL_A', 'COL_B', 'COL_C'],
        [null, 'A1', null, 'C1'] // C2 is empty - intentionally null
      ])

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parser.parse(buffer)

      expect(result.data.SPARSE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['COL_A', 'COL_B', 'COL_C'],
        rows: [['A1', null, 'C1']]
      })
    })

    it('handles realistic structure with metadata, skip columns, and sparse data', async () => {
      const ExcelJS = (await import('exceljs')).default
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

  describe('edge cases', () => {
    describe('multiple worksheets', () => {
      it('should parse metadata from multiple sheets', async () => {
        const ExcelJS = (await import('exceljs')).default
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
    })

    describe('metadata marker without value', () => {
      it('should not lose metadata when marker has no value before next marker appears', async () => {
        const ExcelJS = (await import('exceljs')).default
        const workbook = new ExcelJS.Workbook()
        const sheet = workbook.addWorksheet('Test')

        populateSheet(sheet, [
          ['__EPR_META_TYPE'],
          ['__EPR_META_NAME', 'REPROCESSOR']
        ])

        const buffer = await workbook.xlsx.writeBuffer()
        const result = await parser.parse(buffer)

        // TYPE should be recorded with null value (not lost)
        expect(result.meta.TYPE).toEqual({
          value: null,
          location: { sheet: 'Test', row: 1, column: 'B' }
        })
        // NAME should also be recorded
        expect(result.meta.NAME).toEqual({
          value: 'REPROCESSOR',
          location: { sheet: 'Test', row: 2, column: 'B' }
        })
      })
    })
  })
})
