import ExcelJS from 'exceljs'

import { MATERIAL_PLACEHOLDER_TEXT } from '#domain/summary-logs/markers.js'
import {
  extractCellValue,
  parse,
  SpreadsheetValidationError
} from './exceljs-parser.js'

describe('ExcelJSSummaryLogsParser', () => {
  /**
   * Populates a worksheet from a 2D array where each sub-array represents a row.
   * This makes the worksheet layout immediately visible in tests.
   *
   * @param {Object} worksheet - ExcelJS worksheet to populate
   * @param {Array<Array>} rows - 2D array where rows[0] is row 1, rows[1] is row 2, etc.
   */
  const populateWorksheet = (worksheet, rows) => {
    rows.forEach((rowData, index) => {
      worksheet.getRow(index + 1).values = rowData
    })
  }

  const parseWorkbook = async (worksheets, options = {}) => {
    const workbook = new ExcelJS.Workbook()

    for (const [sheetName, rows] of Object.entries(worksheets)) {
      const worksheet = workbook.addWorksheet(sheetName)
      populateWorksheet(worksheet, rows)
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return parse(buffer, options)
  }

  it('should throw error for invalid Excel buffer', async () => {
    const invalidBuffer = Buffer.from('not an excel file')

    await expect(parse(invalidBuffer)).rejects.toThrow()
  })

  it('should handle empty buffer', async () => {
    const emptyBuffer = Buffer.from('')

    await expect(parse(emptyBuffer)).rejects.toThrow()
  })

  describe('workbook structure validation', () => {
    it('should throw SpreadsheetValidationError when required worksheet is missing', async () => {
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('NotCover')

      const buffer = await workbook.xlsx.writeBuffer()

      await expect(
        parse(buffer, { requiredWorksheet: 'Cover' })
      ).rejects.toThrow(SpreadsheetValidationError)

      await expect(
        parse(buffer, { requiredWorksheet: 'Cover' })
      ).rejects.toThrow("Missing required 'Cover' worksheet")
    })

    it('should accept workbook when required worksheet exists', async () => {
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('Cover')

      const buffer = await workbook.xlsx.writeBuffer()

      await expect(
        parse(buffer, { requiredWorksheet: 'Cover' })
      ).resolves.toEqual({
        meta: {},
        data: {}
      })
    })

    it('should skip required worksheet check when option is null', async () => {
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('AnySheet')

      const buffer = await workbook.xlsx.writeBuffer()

      await expect(parse(buffer, { requiredWorksheet: null })).resolves.toEqual(
        {
          meta: {},
          data: {}
        }
      )
    })

    it('should throw SpreadsheetValidationError when worksheet count exceeds limit', async () => {
      const workbook = new ExcelJS.Workbook()

      // Add 4 worksheets (exceeds limit of 3)
      for (let i = 1; i <= 4; i++) {
        workbook.addWorksheet(`Sheet${i}`)
      }

      const buffer = await workbook.xlsx.writeBuffer()

      await expect(parse(buffer, { maxWorksheets: 3 })).rejects.toThrow(
        SpreadsheetValidationError
      )

      await expect(parse(buffer, { maxWorksheets: 3 })).rejects.toThrow(
        'Too many worksheets (4, maximum 3)'
      )
    })

    it('should throw SpreadsheetValidationError when worksheet has too many rows', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('TooManyRows')

      // Set a cell far down to simulate large rowCount
      worksheet.getCell('A101').value = 'data'

      const buffer = await workbook.xlsx.writeBuffer()

      await expect(parse(buffer, { maxRowsPerSheet: 100 })).rejects.toThrow(
        SpreadsheetValidationError
      )

      await expect(parse(buffer, { maxRowsPerSheet: 100 })).rejects.toThrow(
        "Worksheet 'TooManyRows' has too many rows (101, maximum 100)"
      )
    })

    it('should throw SpreadsheetValidationError when worksheet has too many columns', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('TooManyColumns')

      // Set a cell far to the right to simulate large columnCount
      worksheet.getCell(1, 51).value = 'data'

      const buffer = await workbook.xlsx.writeBuffer()

      await expect(parse(buffer, { maxColumnsPerSheet: 50 })).rejects.toThrow(
        SpreadsheetValidationError
      )

      await expect(parse(buffer, { maxColumnsPerSheet: 50 })).rejects.toThrow(
        "Worksheet 'TooManyColumns' has too many columns (51, maximum 50)"
      )
    })

    it('should accept workbook at exactly the limits', async () => {
      const workbook = new ExcelJS.Workbook()

      // 2 worksheets (exactly at limit of 2)
      workbook.addWorksheet('Sheet1')
      const worksheet = workbook.addWorksheet('Sheet2')
      worksheet.getCell('A10').value = 'last row' // exactly at row limit
      worksheet.getCell(1, 5).value = 'last column' // exactly at column limit

      const buffer = await workbook.xlsx.writeBuffer()

      await expect(
        parse(buffer, {
          maxWorksheets: 2,
          maxRowsPerSheet: 10,
          maxColumnsPerSheet: 5
        })
      ).resolves.toEqual({
        meta: {},
        data: {}
      })
    })

    it('should use default limits when no options provided', async () => {
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('Test')

      const buffer = await workbook.xlsx.writeBuffer()

      // Should not throw with defaults (20 worksheets, 50k rows, 1k columns)
      await expect(parse(buffer)).resolves.toEqual({
        meta: {},
        data: {}
      })
    })
  })

  describe('marker-based parsing', () => {
    it('should extract single metadata marker', async () => {
      const result = await parseWorkbook({
        Sheet1: [['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT']]
      })

      expect(result.meta).toEqual({
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT',
          location: { sheet: 'Sheet1', row: 1, column: 'B' }
        }
      })
    })

    it('extracts multiple metadata markers', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
          ['__EPR_META_MATERIAL', 'Paper and board']
        ]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Test', row: 2, column: 'B' }
      })
    })

    it('extracts data section headers', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING',
            'ROW_ID',
            'DATE_RECEIVED'
          ]
        ]
      })

      expect(result.data.RECEIVED_LOADS_FOR_REPROCESSING).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['ROW_ID', 'DATE_RECEIVED'],
        rows: []
      })
    })

    it('extracts data section headers ending with empty cell', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING',
            'ROW_ID',
            'DATE_RECEIVED',
            '',
            'IGNORED'
          ]
        ]
      })

      expect(result.data.RECEIVED_LOADS_FOR_REPROCESSING).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['ROW_ID', 'DATE_RECEIVED'],
        rows: []
      })
    })

    it('extracts data section with rows', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING',
            'ROW_ID',
            'DATE_RECEIVED'
          ],
          [null, 12345678910, '2025-05-25'],
          [null, 98765432100, '2025-05-26']
        ]
      })

      expect(result.data.RECEIVED_LOADS_FOR_REPROCESSING).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['ROW_ID', 'DATE_RECEIVED'],
        rows: [
          { rowNumber: 2, values: [12345678910, '2025-05-25'] },
          { rowNumber: 3, values: [98765432100, '2025-05-26'] }
        ]
      })
    })

    it('extracts data section terminated by empty row', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING',
            'ROW_ID',
            'DATE_RECEIVED'
          ],
          [null, 12345678910, '2025-05-25'],
          [null, '', ''],
          [null, 'This should be ignored']
        ]
      })

      expect(result.data.RECEIVED_LOADS_FOR_REPROCESSING).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['ROW_ID', 'DATE_RECEIVED'],
        rows: [{ rowNumber: 2, values: [12345678910, '2025-05-25'] }]
      })
    })

    it('handles side-by-side data sections without cross-contamination', async () => {
      const result = await parseWorkbook({
        Test: [
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
        ]
      })

      expect(result.data.TABLE_ONE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['REF_ONE', 'DATE_ONE'],
        rows: [{ rowNumber: 2, values: ['ABC123', '2025-01-01'] }]
      })

      expect(result.data.TABLE_TWO).toEqual({
        location: { sheet: 'Test', row: 1, column: 'F' },
        headers: ['REF_TWO', 'DATE_TWO'],
        rows: [{ rowNumber: 2, values: ['XYZ789', '2025-02-02'] }]
      })
    })

    it('transitions collection from HEADERS to ROWS state correctly', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_TRANSITION_TEST', 'HEADER_ONE', 'HEADER_TWO'],
          [null, 'row1_col1', 'row1_col2'],
          [null, '', '']
        ]
      })

      expect(result.data.TRANSITION_TEST).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['HEADER_ONE', 'HEADER_TWO'],
        rows: [{ rowNumber: 2, values: ['row1_col1', 'row1_col2'] }]
      })

      expect(result.data.TRANSITION_TEST.rows).toHaveLength(1)
    })

    it('handles skip column markers', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_WASTE_RECEIVED',
            'ROW_ID',
            'DATE_RECEIVED',
            '__EPR_SKIP_COLUMN',
            'SUPPLIER_REF',
            'SUPPLIER_NAME'
          ],
          [null, 12345678910, '2025-05-25', null, 'ABC123', 'Joe Blogs']
        ]
      })

      expect(result.data.WASTE_RECEIVED).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: [
          'ROW_ID',
          'DATE_RECEIVED',
          null,
          'SUPPLIER_REF',
          'SUPPLIER_NAME'
        ],
        rows: [
          {
            rowNumber: 2,
            values: [12345678910, '2025-05-25', null, 'ABC123', 'Joe Blogs']
          }
        ]
      })
    })

    it('handles sparse data with missing cells', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_SPARSE', 'COL_A', 'COL_B', 'COL_C'],
          [null, 'A1', null, 'C1'] // C2 is empty - intentionally null
        ]
      })

      expect(result.data.SPARSE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['COL_A', 'COL_B', 'COL_C'],
        rows: [{ rowNumber: 2, values: ['A1', null, 'C1'] }]
      })
    })

    it('handles realistic structure with metadata, skip columns, and sparse data', async () => {
      const result = await parseWorkbook({
        Summary: [
          // Metadata section
          ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
          ['__EPR_META_MATERIAL', 'Paper and board'],
          // Blank row
          [],
          // Data section
          [
            '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING',
            'ROW_ID',
            'DATE_RECEIVED',
            '__EPR_SKIP_COLUMN',
            'SUPPLIER_REF',
            'SUPPLIER_NAME'
          ],
          [null, 12345678910, '2025-05-25', null, 'ABC123', 'Joe Bloggs'],
          [null, 98765432100, '2025-05-26', null, null, 'Jane Smith']
        ]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Summary', row: 1, column: 'B' }
      })
      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Summary', row: 2, column: 'B' }
      })
      expect(result.data.RECEIVED_LOADS_FOR_REPROCESSING).toEqual({
        location: { sheet: 'Summary', row: 4, column: 'B' },
        headers: [
          'ROW_ID',
          'DATE_RECEIVED',
          null,
          'SUPPLIER_REF',
          'SUPPLIER_NAME'
        ],
        rows: [
          {
            rowNumber: 5,
            values: [12345678910, '2025-05-25', null, 'ABC123', 'Joe Bloggs']
          },
          {
            rowNumber: 6,
            values: [98765432100, '2025-05-26', null, null, 'Jane Smith']
          }
        ]
      })
    })
  })

  describe('multiple worksheets', () => {
    it('should parse metadata from multiple sheets', async () => {
      const result = await parseWorkbook({
        Sheet1: [['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT']],
        Sheet2: [['__EPR_META_MATERIAL', 'Paper and board']]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Sheet1', row: 1, column: 'B' }
      })
      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Sheet2', row: 1, column: 'B' }
      })
    })

    it('should merge metadata and data sections from multiple worksheets', async () => {
      const result = await parseWorkbook({
        Sheet1: [
          ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
          [],
          ['__EPR_DATA_WASTE_BALANCE', 'ROW_ID', 'WEIGHT'],
          [null, 12345, 100],
          [null, 67890, 200]
        ],
        Sheet2: [
          ['__EPR_META_MATERIAL', 'Paper and board'],
          [],
          ['__EPR_DATA_SUPPLIER_INFO', 'SUPPLIER_NAME', 'SUPPLIER_REF'],
          [null, 'ABC Ltd', 'ABC123'],
          [null, 'XYZ Corp', 'XYZ789']
        ]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Sheet1', row: 1, column: 'B' }
      })
      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Sheet2', row: 1, column: 'B' }
      })

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Sheet1', row: 3, column: 'B' },
        headers: ['ROW_ID', 'WEIGHT'],
        rows: [
          { rowNumber: 4, values: [12345, 100] },
          { rowNumber: 5, values: [67890, 200] }
        ]
      })

      expect(result.data.SUPPLIER_INFO).toEqual({
        location: { sheet: 'Sheet2', row: 3, column: 'B' },
        headers: ['SUPPLIER_NAME', 'SUPPLIER_REF'],
        rows: [
          { rowNumber: 4, values: ['ABC Ltd', 'ABC123'] },
          { rowNumber: 5, values: ['XYZ Corp', 'XYZ789'] }
        ]
      })
    })
  })

  describe('metadata marker in value position', () => {
    it('should throw error when marker appears where value should be', async () => {
      const result = parseWorkbook({
        Test: [['__EPR_META_TYPE', '__EPR_META_NAME', 'name value']]
      })

      await expect(result).rejects.toThrow(
        'Malformed sheet: metadata marker found in value position'
      )
    })
  })

  describe('multiple metadata markers on same row', () => {
    it('should record both markers when separated by null value', async () => {
      const result = await parseWorkbook({
        Test: [['__EPR_META_TYPE', null, '__EPR_META_NAME', 'name value']]
      })

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
      const result = parseWorkbook({
        Test: [
          [
            '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING',
            'ROW_ID',
            'DATE_RECEIVED'
          ],
          [null, 12345, '2025-05-25'],
          [null, '', ''],
          [],
          [
            '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING',
            'SUPPLIER_REF',
            'WEIGHT'
          ],
          [null, 'ABC123', 100],
          [null, '', '']
        ]
      })

      await expect(result).rejects.toThrow(
        'Duplicate data section name: RECEIVED_LOADS_FOR_REPROCESSING'
      )
    })
  })

  describe('duplicate metadata markers', () => {
    it('should throw error for duplicate metadata marker names', async () => {
      const result = parseWorkbook({
        Test: [
          ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
          ['__EPR_META_MATERIAL', 'Paper and board'],
          ['__EPR_META_PROCESSING_TYPE', 'EXPORTER']
        ]
      })

      await expect(result).rejects.toThrow(
        'Duplicate metadata name: PROCESSING_TYPE'
      )
    })
  })

  describe('data section without empty row terminator', () => {
    it('should emit data section that goes to last row without empty terminator', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_WASTE_RECEIVED', 'ROW_ID', 'DATE_RECEIVED'],
          [null, 12345678910, '2025-05-25'],
          [null, 98765432100, '2025-05-26'],
          [null, 11122233344, '2025-05-27']
        ]
      })

      expect(result.data.WASTE_RECEIVED).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['ROW_ID', 'DATE_RECEIVED'],
        rows: [
          { rowNumber: 2, values: [12345678910, '2025-05-25'] },
          { rowNumber: 3, values: [98765432100, '2025-05-26'] },
          { rowNumber: 4, values: [11122233344, '2025-05-27'] }
        ]
      })
    })
  })

  describe('empty/null metadata values', () => {
    it('should store empty string when metadata marker is followed by empty string cell', async () => {
      const result = await parseWorkbook({
        Test: [['__EPR_META_PROCESSING_TYPE', '']]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: '',
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should store null when metadata marker is followed by explicitly null cell', async () => {
      const result = await parseWorkbook({
        Test: [['__EPR_META_MATERIAL', null, 'extra to ensure B2 is visited']]
      })

      expect(result.meta.MATERIAL).toEqual({
        value: null,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should normalize MATERIAL placeholder text to null', async () => {
      const result = await parseWorkbook({
        Test: [['__EPR_META_MATERIAL', MATERIAL_PLACEHOLDER_TEXT]]
      })

      expect(result.meta.MATERIAL).toEqual({
        value: null,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })
  })

  describe('markers not in column A', () => {
    it('should extract metadata marker and value from correct positions when not in column A', async () => {
      const result = await parseWorkbook({
        Test: [
          [null, null, '__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
          [null, '__EPR_META_MATERIAL', 'Paper and board']
        ]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Test', row: 1, column: 'D' }
      })
      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Test', row: 2, column: 'C' }
      })
    })

    it('should extract data section with correct startColumn when marker not in column A', async () => {
      const result = await parseWorkbook({
        Test: [
          [null, '__EPR_DATA_WASTE_BALANCE', 'ROW_ID', 'DATE_RECEIVED'],
          [null, null, 12345678910, '2025-05-25'],
          [null, null, 98765432100, '2025-05-26']
        ]
      })

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'C' },
        headers: ['ROW_ID', 'DATE_RECEIVED'],
        rows: [
          { rowNumber: 2, values: [12345678910, '2025-05-25'] },
          { rowNumber: 3, values: [98765432100, '2025-05-26'] }
        ]
      })
    })

    it('should handle mixed placement of metadata and data markers', async () => {
      const result = await parseWorkbook({
        Test: [
          [null, null, '__EPR_META_TYPE', 'REPROCESSOR_INPUT'],
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
        ]
      })

      expect(result.meta.TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Test', row: 1, column: 'D' }
      })

      expect(result.data.SECTION_ONE).toEqual({
        location: { sheet: 'Test', row: 3, column: 'D' },
        headers: ['HEADER_A', 'HEADER_B'],
        rows: [{ rowNumber: 4, values: ['value_a1', 'value_b1'] }]
      })

      expect(result.data.SECTION_TWO).toEqual({
        location: { sheet: 'Test', row: 3, column: 'H' },
        headers: ['HEADER_X'],
        rows: [{ rowNumber: 4, values: ['value_x1'] }]
      })
    })
  })

  describe('rows with more cells than headers', () => {
    it('should ignore extra cells beyond the number of headers', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_WASTE_BALANCE', 'HEADER_A', 'HEADER_B', 'HEADER_C'],
          [null, 'value_a1', 'value_b1', 'value_c1', 'extra_1', 'extra_2'],
          [null, 'value_a2', 'value_b2', 'value_c2', 'extra_3']
        ]
      })

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['HEADER_A', 'HEADER_B', 'HEADER_C'],
        rows: [
          { rowNumber: 2, values: ['value_a1', 'value_b1', 'value_c1'] },
          { rowNumber: 3, values: ['value_a2', 'value_b2', 'value_c2'] }
        ]
      })
    })
  })

  describe('completely empty worksheet', () => {
    it('should return empty metadata and no data sections for empty worksheet', async () => {
      const result = await parseWorkbook({ Test: [] })

      expect(result.meta).toEqual({})
      expect(result.data).toEqual({})
    })
  })

  describe('formula cells', () => {
    it('should extract formula result from metadata value', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_META_CALCULATION'
      worksheet.getCell('B1').value = { formula: '=10+20', result: 30 }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.CALCULATION).toEqual({
        value: 30,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should extract formula results from data rows', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_DATA_CALCULATIONS'
      worksheet.getCell('B1').value = 'INPUT'
      worksheet.getCell('C1').value = 'RESULT'

      worksheet.getCell('B2').value = 5
      worksheet.getCell('C2').value = { formula: '=B2*2', result: 10 }

      worksheet.getCell('B3').value = 7
      worksheet.getCell('C3').value = { formula: '=B3*2', result: 14 }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.data.CALCULATIONS).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['INPUT', 'RESULT'],
        rows: [
          { rowNumber: 2, values: [5, 10] },
          { rowNumber: 3, values: [7, 14] }
        ]
      })
    })

    it('should handle formula without cached result', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_META_UNCACHED'
      worksheet.getCell('B1').value = { formula: '=SUM(1,2,3)' }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.UNCACHED).toEqual({
        value: null,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })
  })

  describe('richText cells', () => {
    it('should extract text from richText metadata value', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_META_TITLE'
      worksheet.getCell('B1').value = {
        richText: [{ text: 'Hello' }, { font: { bold: true }, text: ' World' }]
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.TITLE).toEqual({
        value: 'Hello World',
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should extract text from richText in data rows', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_DATA_TEST_TABLE'
      worksheet.getCell('B1').value = 'ID'
      worksheet.getCell('C1').value = 'DESCRIPTION'

      worksheet.getCell('B2').value = 1
      worksheet.getCell('C2').value = {
        richText: [{ text: 'First ' }, { text: 'item' }]
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.data.TEST_TABLE.rows).toEqual([
        { rowNumber: 2, values: [1, 'First item'] }
      ])
    })
  })

  describe('skip column marker as first header', () => {
    it('should handle skip column marker immediately after data marker', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_WASTE_BALANCE',
            '__EPR_SKIP_COLUMN',
            'DATE_RECEIVED',
            'SUPPLIER_REF'
          ],
          [null, null, '2025-05-25', 'ABC123'],
          [null, null, '2025-05-26', 'XYZ789']
        ]
      })

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: [null, 'DATE_RECEIVED', 'SUPPLIER_REF'],
        rows: [
          { rowNumber: 2, values: [null, '2025-05-25', 'ABC123'] },
          { rowNumber: 3, values: [null, '2025-05-26', 'XYZ789'] }
        ]
      })
    })
  })

  describe('all headers are skip columns', () => {
    it('should handle data section where all headers are skip markers', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_ALL_SKIPPED',
            '__EPR_SKIP_COLUMN',
            '__EPR_SKIP_COLUMN',
            '__EPR_SKIP_COLUMN'
          ],
          [null, 'value1', 'value2', 'value3'],
          [null, 'value4', 'value5', 'value6']
        ]
      })

      expect(result.data.ALL_SKIPPED).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: [null, null, null],
        rows: [
          { rowNumber: 2, values: ['value1', 'value2', 'value3'] },
          { rowNumber: 3, values: ['value4', 'value5', 'value6'] }
        ]
      })
    })
  })

  describe('skip row functionality', () => {
    describe('skip example rows', () => {
      it('should skip rows where skip column contains "Example" text', async () => {
        const result = await parseWorkbook({
          Test: [
            [
              '__EPR_DATA_TEST_TABLE',
              'ROW_ID',
              '__EPR_SKIP_COLUMN',
              'DATE_LOAD_LEFT_SITE',
              'WEIGHT'
            ],
            [null, 'row-1', 'Example', '2024-01-15', 100],
            [null, 'row-2', '', '2024-01-16', 200],
            [null, 'row-3', null, '2024-01-17', 300]
          ]
        })

        expect(result.data.TEST_TABLE).toEqual({
          location: { sheet: 'Test', row: 1, column: 'B' },
          headers: ['ROW_ID', null, 'DATE_LOAD_LEFT_SITE', 'WEIGHT'],
          rows: [
            { rowNumber: 3, values: ['row-2', null, '2024-01-16', 200] },
            { rowNumber: 4, values: ['row-3', null, '2024-01-17', 300] }
          ]
        })
      })

      it('should skip multiple example rows', async () => {
        const result = await parseWorkbook({
          Test: [
            ['__EPR_DATA_TEST_TABLE', 'ID', '__EPR_SKIP_COLUMN', 'VALUE'],
            [null, 'ex-1', 'Example', 100],
            [null, 'ex-2', 'Example', 200],
            [null, 'real-1', '', 300],
            [null, 'real-2', null, 400]
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 4, values: ['real-1', null, 300] },
          { rowNumber: 5, values: ['real-2', null, 400] }
        ])
      })

      it('should not skip rows where skip column contains other text', async () => {
        const result = await parseWorkbook({
          Test: [
            ['__EPR_DATA_TEST_TABLE', 'ID', '__EPR_SKIP_COLUMN', 'VALUE'],
            [null, 'row-1', 'Example', 100],
            [null, 'row-2', 'Not Example', 200],
            [null, 'row-3', 'example', 300],
            [null, 'row-4', 'EXAMPLE', 400]
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 3, values: ['row-2', 'Not Example', 200] },
          { rowNumber: 4, values: ['row-3', 'example', 300] },
          { rowNumber: 5, values: ['row-4', 'EXAMPLE', 400] }
        ])
      })

      it('should skip row if any skip column contains "Example"', async () => {
        const result = await parseWorkbook({
          Test: [
            [
              '__EPR_DATA_TEST_TABLE',
              'ID',
              '__EPR_SKIP_COLUMN',
              'VALUE',
              '__EPR_SKIP_COLUMN'
            ],
            [null, 'row-1', 'Example', 100, ''],
            [null, 'row-2', '', 200, 'Example'],
            [null, 'row-3', '', 300, '']
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 4, values: ['row-3', null, 300, null] }
        ])
      })

      it('should work with skip column as first header', async () => {
        const result = await parseWorkbook({
          Test: [
            ['__EPR_DATA_TEST_TABLE', '__EPR_SKIP_COLUMN', 'ID', 'VALUE'],
            [null, 'Example', 'row-1', 100],
            [null, '', 'row-2', 200]
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 3, values: [null, 'row-2', 200] }
        ])
      })

      it('should still terminate section on empty row even after skipping example rows', async () => {
        const result = await parseWorkbook({
          Test: [
            ['__EPR_DATA_TEST_TABLE', 'ID', '__EPR_SKIP_COLUMN', 'VALUE'],
            [null, 'row-1', 'Example', 100],
            [null, 'row-2', '', 200],
            [null, null, null, null]
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 3, values: ['row-2', null, 200] }
        ])
      })

      it('should handle section with only example rows (results in empty rows array)', async () => {
        const result = await parseWorkbook({
          Test: [
            ['__EPR_DATA_TEST_TABLE', 'ID', '__EPR_SKIP_COLUMN', 'VALUE'],
            [null, 'ex-1', 'Example', 100],
            [null, 'ex-2', 'Example', 200],
            [null, null, null, null]
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([])
      })

      it('should not skip rows when no skip column is defined', async () => {
        const result = await parseWorkbook({
          Test: [
            ['__EPR_DATA_TEST_TABLE', 'ROW_ID', 'DATE_RECEIVED'],
            [null, 12345678910, '2025-05-25'],
            [null, 'Example', '2025-05-26']
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 2, values: [12345678910, '2025-05-25'] },
          { rowNumber: 3, values: ['Example', '2025-05-26'] }
        ])
      })
    })

    describe('skip header rows', () => {
      it('should skip header row', async () => {
        const result = await parseWorkbook({
          Test: [
            [
              '__EPR_DATA_TEST_TABLE',
              'ROW_ID',
              'DATE_RECEIVED',
              'SUPPLIER_REF'
            ],
            [null, 'Row ID', 'Date received', 'Supplier reference'],
            [null, 12345678910, '2025-05-25', 'ABC123'],
            [null, 98765432100, '2025-05-26', 'DEF456']
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 3, values: [12345678910, '2025-05-25', 'ABC123'] },
          { rowNumber: 4, values: [98765432100, '2025-05-26', 'DEF456'] }
        ])
      })

      it('should skip header row and example row', async () => {
        const result = await parseWorkbook({
          Test: [
            [
              '__EPR_DATA_TEST_TABLE',
              'ROW_ID',
              'DATE_RECEIVED',
              '__EPR_SKIP_COLUMN',
              'SUPPLIER_REF'
            ],
            [null, 'Row ID', 'Date received', null, 'Supplier reference'],
            [null, 12345678910, '2025-05-25', 'Example', 'ABC123'],
            [null, 98765432100, '2025-05-26', null, 'DEF456'],
            [null, 11122233344, '2025-05-27', null, 'GHI789']
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 4, values: [98765432100, '2025-05-26', null, 'DEF456'] },
          { rowNumber: 5, values: [11122233344, '2025-05-27', null, 'GHI789'] }
        ])
      })

      it('should be case-sensitive for "Row ID" skip text', async () => {
        const result = await parseWorkbook({
          Test: [
            ['__EPR_DATA_TEST_TABLE', 'ROW_ID', 'DATE_RECEIVED'],
            [null, 'Row ID', '2025-05-25'],
            [null, 'row id', '2025-05-26'],
            [null, 'ROW_ID', '2025-05-27'],
            [null, 'ROW ID', '2025-05-28']
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 3, values: ['row id', '2025-05-26'] },
          { rowNumber: 4, values: ['ROW_ID', '2025-05-27'] },
          { rowNumber: 5, values: ['ROW ID', '2025-05-28'] }
        ])
      })

      it('should skip header row when ROW_ID starts with "Row ID" but contains additional text', async () => {
        const workbook = new ExcelJS.Workbook()
        const worksheet = workbook.addWorksheet('Test')

        worksheet.getCell('A1').value = '__EPR_DATA_TEST_TABLE'
        worksheet.getCell('B1').value = 'ROW_ID'
        worksheet.getCell('C1').value = 'DATE_RECEIVED'

        // Header row with richText containing "Row ID" plus additional description
        worksheet.getCell('B2').value = {
          richText: [
            { font: { bold: true }, text: 'Row ID' },
            { text: '\n(Automatically generated)' }
          ]
        }
        worksheet.getCell('C2').value = 'Date received'

        // Data rows
        worksheet.getCell('B3').value = 1001
        worksheet.getCell('C3').value = '2025-05-25'

        worksheet.getCell('B4').value = 1002
        worksheet.getCell('C4').value = '2025-05-26'

        const buffer = await workbook.xlsx.writeBuffer()
        const result = await parse(buffer)

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 3, values: [1001, '2025-05-25'] },
          { rowNumber: 4, values: [1002, '2025-05-26'] }
        ])
      })

      it('should skip header row when ROW_ID is plain text starting with "Row ID"', async () => {
        const result = await parseWorkbook({
          Test: [
            ['__EPR_DATA_TEST_TABLE', 'ROW_ID', 'DATE_RECEIVED'],
            [null, 'Row ID (auto)', 'Date received'],
            [null, 1001, '2025-05-25'],
            [null, 1002, '2025-05-26']
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 3, values: [1001, '2025-05-25'] },
          { rowNumber: 4, values: [1002, '2025-05-26'] }
        ])
      })

      it('should skip rows where ROW_ID is null (template rows with default dropdown values)', async () => {
        const result = await parseWorkbook({
          Test: [
            ['__EPR_DATA_TEST_TABLE', 'ROW_ID', 'DATE_RECEIVED', 'HAS_VALUE'],
            [null, 1001, '2025-05-25', 'Yes'],
            [null, 1002, '2025-05-26', 'No'],
            [null, null, null, 'No'], // Empty row with default dropdown value
            [null, null, null, 'No'], // Another empty row
            [null, 1003, '2025-05-27', 'Yes']
          ]
        })

        expect(result.data.TEST_TABLE.rows).toEqual([
          { rowNumber: 2, values: [1001, '2025-05-25', 'Yes'] },
          { rowNumber: 3, values: [1002, '2025-05-26', 'No'] },
          { rowNumber: 6, values: [1003, '2025-05-27', 'Yes'] }
        ])
      })
    })
  })

  describe('partial empty rows', () => {
    it('should treat row with some nulls and some values as data row, not terminator', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_PARTIAL_NULLS', 'COLUMN_A', 'COLUMN_B', 'COLUMN_C'],
          [null, 'value1', 'value2', 'value3'],
          [null, null, null, 'only_last_has_value'],
          [null, 'value4', null, 'value5'],
          [null, null, null, null]
        ]
      })

      expect(result.data.PARTIAL_NULLS).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['COLUMN_A', 'COLUMN_B', 'COLUMN_C'],
        rows: [
          { rowNumber: 2, values: ['value1', 'value2', 'value3'] },
          { rowNumber: 3, values: [null, null, 'only_last_has_value'] },
          { rowNumber: 4, values: ['value4', null, 'value5'] }
        ]
      })
    })
  })

  describe('date cells', () => {
    it('should extract date as ISO string from metadata value', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      const testDate = new Date('2025-05-25T00:00:00.000Z')

      worksheet.getCell('A1').value = '__EPR_META_SUBMISSION_DATE'
      worksheet.getCell('B1').value = testDate

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.SUBMISSION_DATE).toEqual({
        value: '2025-05-25T00:00:00.000Z',
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should extract dates as ISO strings from data rows', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      const date1 = new Date('2025-05-25T00:00:00.000Z')
      const date2 = new Date('2025-06-15T00:00:00.000Z')

      worksheet.getCell('A1').value = '__EPR_DATA_WASTE_RECEIVED'
      worksheet.getCell('B1').value = 'ROW_ID'
      worksheet.getCell('C1').value = 'DATE_RECEIVED'

      worksheet.getCell('B2').value = 12345678910
      worksheet.getCell('C2').value = date1

      worksheet.getCell('B3').value = 98765432100
      worksheet.getCell('C3').value = date2

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.data.WASTE_RECEIVED).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['ROW_ID', 'DATE_RECEIVED'],
        rows: [
          { rowNumber: 2, values: [12345678910, '2025-05-25T00:00:00.000Z'] },
          { rowNumber: 3, values: [98765432100, '2025-06-15T00:00:00.000Z'] }
        ]
      })
    })

    it('should handle dates in mixed data types', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      const date = new Date('2025-05-25T00:00:00.000Z')

      worksheet.getCell('A1').value = '__EPR_DATA_MIXED_TYPES'
      worksheet.getCell('B1').value = 'STRING_COL'
      worksheet.getCell('C1').value = 'DATE_COL'
      worksheet.getCell('D1').value = 'NUMBER_COL'

      worksheet.getCell('B2').value = 'some text'
      worksheet.getCell('C2').value = date
      worksheet.getCell('D2').value = 42

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.data.MIXED_TYPES).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['STRING_COL', 'DATE_COL', 'NUMBER_COL'],
        rows: [
          {
            rowNumber: 2,
            values: ['some text', '2025-05-25T00:00:00.000Z', 42]
          }
        ]
      })
    })
  })

  describe('boolean cells', () => {
    it('should extract boolean true from metadata value', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_META_IS_ACTIVE'
      worksheet.getCell('B1').value = true

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.IS_ACTIVE).toEqual({
        value: true,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should extract boolean false from metadata value', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_META_IS_ACTIVE'
      worksheet.getCell('B1').value = false

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.IS_ACTIVE).toEqual({
        value: false,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should extract booleans from data rows', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_DATA_FLAGS'
      worksheet.getCell('B1').value = 'ROW_ID'
      worksheet.getCell('C1').value = 'IS_VERIFIED'

      worksheet.getCell('B2').value = 1001
      worksheet.getCell('C2').value = true

      worksheet.getCell('B3').value = 1002
      worksheet.getCell('C3').value = false

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.data.FLAGS.rows).toEqual([
        { rowNumber: 2, values: [1001, true] },
        { rowNumber: 3, values: [1002, false] }
      ])
    })
  })

  describe('error cells', () => {
    it('should return null for formula with error result in metadata', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_META_CALCULATION'
      // Simulate what ExcelJS returns for a formula that produces #DIV/0!
      worksheet.getCell('B1').value = {
        formula: '=1/0',
        result: { error: '#DIV/0!' }
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.CALCULATION).toEqual({
        value: null,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should return null for formula with error result in data rows', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_DATA_CALCULATIONS'
      worksheet.getCell('B1').value = 'ROW_ID'
      worksheet.getCell('C1').value = 'RESULT'

      worksheet.getCell('B2').value = 1001
      // Formula that produces #DIV/0!
      worksheet.getCell('C2').value = {
        formula: '=1/0',
        result: { error: '#DIV/0!' }
      }

      worksheet.getCell('B3').value = 1002
      // Formula that produces #N/A (e.g. failed VLOOKUP)
      worksheet.getCell('C3').value = {
        formula: '=VLOOKUP("notfound",A1:A1,1,FALSE)',
        result: { error: '#N/A' }
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.data.CALCULATIONS.rows).toEqual([
        { rowNumber: 2, values: [1001, null] },
        { rowNumber: 3, values: [1002, null] }
      ])
    })

    it('should return null for direct error value', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_META_ERROR'
      // Direct error value (no formula)
      worksheet.getCell('B1').value = { error: '#VALUE!' }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.ERROR).toEqual({
        value: null,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })
  })

  describe('hyperlink cells', () => {
    it('should extract text from hyperlink in metadata value', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_META_WEBSITE'
      worksheet.getCell('B1').value = {
        text: 'Our Website',
        hyperlink: 'https://example.com'
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.WEBSITE).toEqual({
        value: 'Our Website',
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should extract text from hyperlinks in data rows', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_DATA_CONTACTS'
      worksheet.getCell('B1').value = 'ROW_ID'
      worksheet.getCell('C1').value = 'EMAIL'

      worksheet.getCell('B2').value = 1001
      worksheet.getCell('C2').value = {
        text: 'contact@example.com',
        hyperlink: 'mailto:contact@example.com'
      }

      worksheet.getCell('B3').value = 1002
      worksheet.getCell('C3').value = {
        text: 'support@example.com',
        hyperlink: 'mailto:support@example.com',
        tooltip: 'Email our support team'
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.data.CONTACTS.rows).toEqual([
        { rowNumber: 2, values: [1001, 'contact@example.com'] },
        { rowNumber: 3, values: [1002, 'support@example.com'] }
      ])
    })

    it('should extract text from internal worksheet hyperlink', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getCell('A1').value = '__EPR_META_LINK'
      worksheet.getCell('B1').value = {
        text: 'Go to Summary',
        hyperlink: "#'Summary'!A1"
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.LINK).toEqual({
        value: 'Go to Summary',
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })
  })

  describe('metadata and data ordering', () => {
    it('should allow metadata after complete data section', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_WASTE_BALANCE', 'ROW_ID', 'DATE_RECEIVED'],
          [null, 12345678910, '2025-05-25'],
          [null, 98765432100, '2025-05-26'],
          [null, '', ''],
          ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
          ['__EPR_META_MATERIAL', 'Paper and board']
        ]
      })

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['ROW_ID', 'DATE_RECEIVED'],
        rows: [
          { rowNumber: 2, values: [12345678910, '2025-05-25'] },
          { rowNumber: 3, values: [98765432100, '2025-05-26'] }
        ]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Test', row: 5, column: 'B' }
      })

      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Test', row: 6, column: 'B' }
      })
    })

    it('should allow metadata interspersed with data rows in separate columns', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_WASTE_BALANCE', 'ROW_ID', 'DATE_RECEIVED'],
          [null, 12345678910, '2025-05-25'],
          [
            null,
            98765432100,
            '2025-05-26',
            null,
            '__EPR_META_PROCESSING_TYPE',
            'REPROCESSOR_INPUT'
          ],
          [null, 11122233344, '2025-05-27'],
          [null, '', '']
        ]
      })

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['ROW_ID', 'DATE_RECEIVED'],
        rows: [
          { rowNumber: 2, values: [12345678910, '2025-05-25'] },
          { rowNumber: 3, values: [98765432100, '2025-05-26'] },
          { rowNumber: 4, values: [11122233344, '2025-05-27'] }
        ]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Test', row: 3, column: 'F' }
      })
    })

    it('should handle multiple metadata markers after data section', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_SUPPLIER_INFO', 'SUPPLIER_NAME', 'SUPPLIER_REF'],
          [null, 'ABC Ltd', 'ABC123'],
          [null, 'XYZ Corp', 'XYZ789'],
          [null, '', ''],
          [],
          ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
          ['__EPR_META_MATERIAL', 'Paper and board'],
          ['__EPR_META_SUBMISSION_DATE', '2025-05-25']
        ]
      })

      expect(result.data.SUPPLIER_INFO).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['SUPPLIER_NAME', 'SUPPLIER_REF'],
        rows: [
          { rowNumber: 2, values: ['ABC Ltd', 'ABC123'] },
          { rowNumber: 3, values: ['XYZ Corp', 'XYZ789'] }
        ]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Test', row: 6, column: 'B' }
      })

      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Test', row: 7, column: 'B' }
      })

      expect(result.meta.SUBMISSION_DATE).toEqual({
        value: '2025-05-25',
        location: { sheet: 'Test', row: 8, column: 'B' }
      })
    })

    it('should handle data-metadata-data sandwich pattern', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_FIRST_SECTION', 'COLUMN_A', 'COLUMN_B'],
          [null, 'value_a1', 'value_b1'],
          [null, '', ''],
          [],
          ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
          ['__EPR_META_MATERIAL', 'Paper and board'],
          [],
          ['__EPR_DATA_SECOND_SECTION', 'COLUMN_X', 'COLUMN_Y'],
          [null, 'value_x1', 'value_y1'],
          [null, 'value_x2', 'value_y2'],
          [null, '', '']
        ]
      })

      expect(result.data.FIRST_SECTION).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['COLUMN_A', 'COLUMN_B'],
        rows: [{ rowNumber: 2, values: ['value_a1', 'value_b1'] }]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Test', row: 5, column: 'B' }
      })

      expect(result.meta.MATERIAL).toEqual({
        value: 'Paper and board',
        location: { sheet: 'Test', row: 6, column: 'B' }
      })

      expect(result.data.SECOND_SECTION).toEqual({
        location: { sheet: 'Test', row: 8, column: 'B' },
        headers: ['COLUMN_X', 'COLUMN_Y'],
        rows: [
          { rowNumber: 9, values: ['value_x1', 'value_y1'] },
          { rowNumber: 10, values: ['value_x2', 'value_y2'] }
        ]
      })
    })

    it('should handle metadata in same row as data marker', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_WASTE_BALANCE',
            'ROW_ID',
            'DATE_RECEIVED',
            null,
            '__EPR_META_PROCESSING_TYPE',
            'REPROCESSOR_INPUT'
          ],
          [null, 12345678910, '2025-05-25'],
          [null, '', '']
        ]
      })

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['ROW_ID', 'DATE_RECEIVED'],
        rows: [{ rowNumber: 2, values: [12345678910, '2025-05-25'] }]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Test', row: 1, column: 'F' }
      })
    })
  })

  describe('placeholder text normalization', () => {
    it('should normalize "Choose option" to null in data rows', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_WASTE_RECEIVED', 'ROW_ID', 'STATUS', 'TYPE'],
          [null, 12345678910, 'Choose option', 'Choose option'],
          [null, 98765432100, 'Active', 'Choose option']
        ]
      })

      expect(result.data.WASTE_RECEIVED.rows).toEqual([
        { rowNumber: 2, values: [12345678910, null, null] },
        { rowNumber: 3, values: [98765432100, 'Active', null] }
      ])
    })

    it('should treat rows with mix of empty and "Choose option" as empty and terminate section', async () => {
      // Realistic scenario: blank rows have empty cells plus dropdown defaults
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_WASTE_RECEIVED', 'ROW_ID', 'DATE', 'EWC_CODE', 'WEIGHT'],
          [null, 12345678910, '2025-01-15', '03 03 08', 1000],
          [null, null, null, 'Choose option', null], // Blank row: empty + dropdown default
          [null, 'This should be ignored', '2025-12-31', '03 03 08', 9999]
        ]
      })

      expect(result.data.WASTE_RECEIVED.rows).toEqual([
        { rowNumber: 2, values: [12345678910, '2025-01-15', '03 03 08', 1000] }
      ])
    })

    it('should not normalize "Choose option" in metadata values', async () => {
      const result = await parseWorkbook({
        Test: [['__EPR_META_DROPDOWN_DEFAULT', 'Choose option']]
      })

      expect(result.meta.DROPDOWN_DEFAULT.value).toBe('Choose option')
    })

    it('should handle mixed empty values and placeholder text', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_WASTE_RECEIVED', 'COL_A', 'COL_B', 'COL_C', 'COL_D'],
          [null, null, '', 'Choose option', 'actual value']
        ]
      })

      expect(result.data.WASTE_RECEIVED.rows).toEqual([
        { rowNumber: 2, values: [null, null, null, 'actual value'] }
      ])
    })

    it('should be case-sensitive for placeholder text', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_WASTE_RECEIVED', 'COL_A', 'COL_B', 'COL_C'],
          [null, 'Choose option', 'CHOOSE OPTION', 'choose Option']
        ]
      })

      expect(result.data.WASTE_RECEIVED.rows).toEqual([
        { rowNumber: 2, values: [null, 'CHOOSE OPTION', 'choose Option'] }
      ])
    })
  })

  describe('phantom row protection', () => {
    it('should handle workbook with legitimate gaps between data sections', async () => {
      // Test that we can handle gaps smaller than MAX_CONSECUTIVE_EMPTY_ROWS
      const result = await parseWorkbook({
        Test: [
          ['__EPR_META_TYPE', 'REPROCESSOR_INPUT'],
          [],
          [],
          [],
          ['__EPR_DATA_SECTION_ONE', 'HEADER_A'],
          [null, 'value_a'],
          [null, ''],
          [],
          [],
          [],
          ['__EPR_DATA_SECTION_TWO', 'HEADER_B'],
          [null, 'value_b']
        ]
      })

      expect(result.meta.TYPE.value).toBe('REPROCESSOR_INPUT')
      expect(result.data.SECTION_ONE.rows).toEqual([
        { rowNumber: 6, values: ['value_a'] }
      ])
      expect(result.data.SECTION_TWO.rows).toEqual([
        { rowNumber: 12, values: ['value_b'] }
      ])
    })

    it('should continue processing data sections after empty row gaps', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_FIRST', 'COL_A'],
          [null, 'row_1'],
          [null, ''],
          [],
          [],
          [],
          [],
          [],
          ['__EPR_DATA_SECOND', 'COL_B'],
          [null, 'row_2']
        ]
      })

      expect(result.data.FIRST.rows).toEqual([
        { rowNumber: 2, values: ['row_1'] }
      ])
      expect(result.data.SECOND.rows).toEqual([
        { rowNumber: 10, values: ['row_2'] }
      ])
    })

    it('should handle worksheet ending with empty rows', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_META_TYPE', 'TEST_VALUE'],
          ['__EPR_DATA_TEST', 'COLUMN_A'],
          [null, 'data_row_1'],
          [null, ''],
          [],
          [],
          []
        ]
      })

      expect(result.meta.TYPE.value).toBe('TEST_VALUE')
      expect(result.data.TEST.rows).toEqual([
        { rowNumber: 3, values: ['data_row_1'] }
      ])
    })

    it('should correctly parse data before large empty gaps', async () => {
      // Simulate a worksheet with data followed by a significant gap
      // (less than MAX_CONSECUTIVE_EMPTY_ROWS to verify we handle gaps correctly)
      const rows = [
        ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
        ['__EPR_DATA_LOADS', 'ROW_ID', 'WEIGHT'],
        [null, 'load-001', 100],
        [null, 'load-002', 200],
        [null, '', '']
      ]

      // Add 50 empty rows (less than threshold of 100)
      for (let i = 0; i < 50; i++) {
        rows.push([])
      }

      // Add more data after the gap
      rows.push(['__EPR_DATA_OUTPUTS', 'OUTPUT_ID'])
      rows.push([null, 'output-001'])

      const result = await parseWorkbook({ Test: rows })

      expect(result.meta.PROCESSING_TYPE.value).toBe('REPROCESSOR_INPUT')
      expect(result.data.LOADS.rows).toEqual([
        { rowNumber: 3, values: ['load-001', 100] },
        { rowNumber: 4, values: ['load-002', 200] }
      ])
      expect(result.data.OUTPUTS.rows).toEqual([
        { rowNumber: 57, values: ['output-001'] }
      ])
    })

    it('should stop processing worksheet after 100 consecutive empty rows with formatting', async () => {
      // ExcelJS eachRow() skips completely empty rows, but visits rows that have
      // any cell data (including just formatting). This test simulates phantom rows
      // by creating rows with empty string values, which get visited by eachRow().
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      // Real data at the top
      worksheet.getRow(1).values = ['__EPR_META_TYPE', 'BEFORE_PHANTOM']
      worksheet.getRow(2).values = ['__EPR_DATA_FIRST', 'HEADER_A']
      worksheet.getRow(3).values = [null, 'valid_data']
      worksheet.getRow(4).values = [null, ''] // terminates the section

      // Simulate 101 phantom rows with formatting (represented as empty string cells)
      // These rows get visited by eachRow() because they have cell data
      for (let i = 5; i <= 105; i++) {
        // Set an empty cell value - this creates a row that eachRow() will visit
        worksheet.getCell(`A${i}`).value = ''
      }

      // Data after the phantom gap - should NOT be processed
      worksheet.getRow(106).values = ['__EPR_META_PHANTOM', 'AFTER_PHANTOM']
      worksheet.getRow(107).values = ['__EPR_DATA_SECOND', 'HEADER_B']
      worksheet.getRow(108).values = [null, 'phantom_data']

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      // Data before the phantom gap should be parsed
      expect(result.meta.TYPE.value).toBe('BEFORE_PHANTOM')
      expect(result.data.FIRST.rows).toEqual([
        { rowNumber: 3, values: ['valid_data'] }
      ])

      // Data after the phantom gap should NOT be parsed (processing stopped)
      expect(result.meta.PHANTOM).toBeUndefined()
      expect(result.data.SECOND).toBeUndefined()
    })
  })

  describe('phantom column protection', () => {
    it('should parse data correctly when columns are within normal range', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_SECTION', 'COL_A', 'COL_B', 'COL_C'],
          [null, 'val1', 'val2', 'val3'],
          [null, '']
        ]
      })

      expect(result.data.SECTION.headers).toEqual(['COL_A', 'COL_B', 'COL_C'])
      expect(result.data.SECTION.rows).toEqual([
        { rowNumber: 2, values: ['val1', 'val2', 'val3'] }
      ])
    })

    it('should handle skip columns within data', async () => {
      // Test that __EPR_SKIP_COLUMN markers work correctly (not empty gaps)
      // Note: Empty strings in headers terminate header collection by design
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_SECTION',
            'COL_A',
            '__EPR_SKIP_COLUMN',
            '__EPR_SKIP_COLUMN',
            'COL_B'
          ],
          [null, 'val1', null, null, 'val2'],
          [null, '']
        ]
      })

      expect(result.data.SECTION.headers).toEqual([
        'COL_A',
        null,
        null,
        'COL_B'
      ])
      expect(result.data.SECTION.rows).toEqual([
        { rowNumber: 2, values: ['val1', null, null, 'val2'] }
      ])
    })

    it('should stop collecting cells after 100 consecutive empty columns', async () => {
      // Create a workbook with phantom columns extending far to the right
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      // Row 1: data marker and headers in first few columns
      worksheet.getRow(1).values = ['__EPR_DATA_SECTION', 'COL_A', 'COL_B']

      // Row 2: data values followed by 101 empty cells, then more data
      const row2 = worksheet.getRow(2)
      row2.getCell(1).value = null // marker column
      row2.getCell(2).value = 'data_a'
      row2.getCell(3).value = 'data_b'

      // Simulate 101 phantom columns with empty formatting
      for (let col = 4; col <= 104; col++) {
        row2.getCell(col).value = ''
      }

      // Data after the phantom gap - should NOT be collected
      row2.getCell(105).value = 'phantom_data'

      // Row 3: empty row to terminate section
      worksheet.getRow(3).values = [null, '']

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      // Data within the threshold should be parsed
      expect(result.data.SECTION.rows[0].values).toContain('data_a')
      expect(result.data.SECTION.rows[0].values).toContain('data_b')

      // Data after the phantom column gap should NOT be in the results
      // (the phantom_data in column 105 should not appear)
      expect(result.data.SECTION.rows[0].values).not.toContain('phantom_data')
    })

    it('should handle metadata in columns before phantom gap', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      // Metadata in columns A and B
      worksheet.getRow(1).values = ['__EPR_META_TYPE', 'VALID_TYPE']

      // Simulate phantom columns on the same row (shouldn't affect metadata parsing)
      const row1 = worksheet.getRow(1)
      for (let col = 3; col <= 103; col++) {
        row1.getCell(col).value = ''
      }
      // More metadata marker after phantom gap - should not be parsed
      row1.getCell(104).value = '__EPR_META_PHANTOM'
      row1.getCell(105).value = 'PHANTOM_VALUE'

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      // Metadata before phantom columns should be parsed
      expect(result.meta.TYPE.value).toBe('VALID_TYPE')

      // Metadata after phantom columns should NOT be parsed
      expect(result.meta.PHANTOM).toBeUndefined()
    })

    it('should reset consecutive empty count when non-empty cell encountered', async () => {
      // Test that scattered empty cells don't accumulate across non-empty cells
      // This tests the cell collection, not header parsing (which terminates on empty)
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      // Row 1: metadata with 50 empty cells before the value
      // (metadata parsing looks at each pair of cells, so this tests cell collection)
      const row1 = worksheet.getRow(1)
      row1.getCell(1).value = '__EPR_META_FIRST'
      row1.getCell(2).value = 'value_a'
      // Add 50 empty cells
      for (let col = 3; col <= 52; col++) {
        row1.getCell(col).value = ''
      }
      // Then another metadata pair
      row1.getCell(53).value = '__EPR_META_SECOND'
      row1.getCell(54).value = 'value_b'
      // Add another 50 empty cells
      for (let col = 55; col <= 104; col++) {
        row1.getCell(col).value = ''
      }
      // Final metadata pair - should still be collected since no 100+ consecutive gap
      row1.getCell(105).value = '__EPR_META_THIRD'
      row1.getCell(106).value = 'value_c'

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      // All metadata should be parsed since gaps are less than 100
      expect(result.meta.FIRST.value).toBe('value_a')
      expect(result.meta.SECOND.value).toBe('value_b')
      expect(result.meta.THIRD.value).toBe('value_c')
    })
  })
})

describe('extractCellValue', () => {
  it('returns primitive values unchanged', () => {
    expect(extractCellValue('hello')).toBe('hello')
    expect(extractCellValue(123)).toBe(123)
    expect(extractCellValue(null)).toBe(null)
    expect(extractCellValue(undefined)).toBe(undefined)
  })

  it('extracts result from formula cell', () => {
    expect(extractCellValue({ formula: '=A1+B1', result: 42 })).toBe(42)
  })

  it('extracts result from sharedFormula cell', () => {
    expect(extractCellValue({ sharedFormula: 'B8', result: 1001 })).toBe(1001)
  })

  it('returns null for formula without result', () => {
    expect(extractCellValue({ formula: '=SUM(1,2,3)' })).toBe(null)
  })

  it('returns null for sharedFormula without result', () => {
    expect(extractCellValue({ sharedFormula: 'B8' })).toBe(null)
  })

  it('extracts text from richText cell', () => {
    expect(
      extractCellValue({
        richText: [{ text: 'Hello' }, { text: ' World' }]
      })
    ).toBe('Hello World')
  })

  it('throws error for unknown object cell type', () => {
    const unknownObject = { someProperty: 'value' }
    expect(() => extractCellValue(unknownObject)).toThrow(
      'Unknown cell value type'
    )
  })

  it('extracts text from hyperlink cell', () => {
    expect(
      extractCellValue({
        text: 'webuy@boomerang.co.uk',
        hyperlink: 'mailto:webuy@boomerang.co.uk'
      })
    ).toBe('webuy@boomerang.co.uk')
  })

  it('extracts text from hyperlink cell with URL', () => {
    expect(
      extractCellValue({
        text: 'Click here',
        hyperlink: 'https://example.com'
      })
    ).toBe('Click here')
  })

  it('converts Date objects to ISO strings', () => {
    const date = new Date('2025-08-01T00:00:00.000Z')
    expect(extractCellValue(date)).toBe('2025-08-01T00:00:00.000Z')
  })

  it('converts Date objects with time to ISO strings', () => {
    const date = new Date('2025-12-25T14:30:00.000Z')
    expect(extractCellValue(date)).toBe('2025-12-25T14:30:00.000Z')
  })

  describe('boolean values', () => {
    it('returns true unchanged', () => {
      expect(extractCellValue(true)).toBe(true)
    })

    it('returns false unchanged', () => {
      expect(extractCellValue(false)).toBe(false)
    })
  })

  describe('error values', () => {
    it.each([
      '#N/A',
      '#VALUE!',
      '#REF!',
      '#DIV/0!',
      '#NULL!',
      '#NAME?',
      '#NUM!'
    ])('returns null for %s error', (errorCode) => {
      expect(extractCellValue({ error: errorCode })).toBe(null)
    })
  })

  describe('hyperlink variations', () => {
    it('extracts text from hyperlink with tooltip', () => {
      expect(
        extractCellValue({
          text: 'Visit our site',
          hyperlink: 'https://example.com',
          tooltip: 'Click to visit example.com'
        })
      ).toBe('Visit our site')
    })

    it('extracts text from internal worksheet hyperlink', () => {
      expect(
        extractCellValue({
          text: 'Go to Sheet2',
          hyperlink: "#'Sheet2'!A1"
        })
      ).toBe('Go to Sheet2')
    })

    it('extracts text from mailto hyperlink', () => {
      expect(
        extractCellValue({
          text: 'contact@example.com',
          hyperlink: 'mailto:contact@example.com'
        })
      ).toBe('contact@example.com')
    })
  })

  describe('array formulas', () => {
    it('extracts result from array formula', () => {
      expect(
        extractCellValue({
          formula: 'A1',
          result: 10,
          shareType: 'array',
          ref: 'A2:B3'
        })
      ).toBe(10)
    })

    it('returns null for array formula without result', () => {
      expect(
        extractCellValue({
          formula: 'SUM(A1:A10)',
          shareType: 'array',
          ref: 'B1:B10'
        })
      ).toBe(null)
    })
  })

  describe('richText edge cases', () => {
    it('returns empty string for empty richText array', () => {
      expect(extractCellValue({ richText: [] })).toBe('')
    })

    it('handles richText with empty text segments', () => {
      expect(
        extractCellValue({
          richText: [{ text: '' }, { text: 'visible' }, { text: '' }]
        })
      ).toBe('visible')
    })

    it('handles richText with various font properties', () => {
      expect(
        extractCellValue({
          richText: [
            {
              font: {
                bold: true,
                size: 12,
                color: { argb: 'FFFF6600' },
                name: 'Calibri'
              },
              text: 'Bold'
            },
            {
              font: { italic: true, underline: true },
              text: ' and italic'
            }
          ]
        })
      ).toBe('Bold and italic')
    })
  })

  describe('formula with date result', () => {
    it('extracts date result from formula and converts to ISO string', () => {
      const dateResult = new Date('2025-06-15T00:00:00.000Z')
      expect(
        extractCellValue({
          formula: '=TODAY()',
          result: dateResult
        })
      ).toBe('2025-06-15T00:00:00.000Z')
    })
  })
})
