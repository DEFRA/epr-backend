import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'

import { parse } from './exceljs-parser.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

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

  const parseWorkbook = async (worksheets) => {
    const workbook = new ExcelJS.Workbook()

    for (const [sheetName, rows] of Object.entries(worksheets)) {
      const worksheet = workbook.addWorksheet(sheetName)
      populateWorksheet(worksheet, rows)
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return parse(buffer)
  }

  describe('sheet with no markers', () => {
    it('should return empty metadata and data', async () => {
      const excelBuffer = await readFile(
        path.join(dirname, '../../../data/fixtures/uploads/reprocessor.xlsx')
      )
      const result = await parse(excelBuffer)

      expect(result).toBeDefined()
      expect(result.meta).toBeDefined()
      // Note: reprocessor.xlsx fixture contains old markers - REGISTRATION not REGISTRATION_NUMBER
      // This test validates the parser works with the fixture file as-is
      expect(result.meta).toMatchObject({
        PROCESSING_TYPE: expect.any(Object),
        REGISTRATION: expect.any(Object),
        TEMPLATE_VERSION: expect.any(Object)
      })
      expect(result.data).toBeDefined()
    })
  })

  it('should throw error for invalid Excel buffer', async () => {
    const invalidBuffer = Buffer.from('not an excel file')

    await expect(parse(invalidBuffer)).rejects.toThrow()
  })

  it('should handle empty buffer', async () => {
    const emptyBuffer = Buffer.from('')

    await expect(parse(emptyBuffer)).rejects.toThrow()
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
          ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED']
        ]
      })

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: []
      })
    })

    it('extracts data section headers ending with empty cell', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_UPDATE_WASTE_BALANCE',
            'OUR_REFERENCE',
            'DATE_RECEIVED',
            '',
            'IGNORED'
          ]
        ]
      })

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: []
      })
    })

    it('extracts data section with rows', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
          [null, 12345678910, '2025-05-25'],
          [null, 98765432100, '2025-05-26']
        ]
      })

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
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
          [null, 12345678910, '2025-05-25'],
          [null, '', ''],
          [null, 'This should be ignored']
        ]
      })

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [[12345678910, '2025-05-25']]
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
        rows: [['ABC123', '2025-01-01']]
      })

      expect(result.data.TABLE_TWO).toEqual({
        location: { sheet: 'Test', row: 1, column: 'F' },
        headers: ['REF_TWO', 'DATE_TWO'],
        rows: [['XYZ789', '2025-02-02']]
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
        rows: [['row1_col1', 'row1_col2']]
      })

      expect(result.data.TRANSITION_TEST.rows).toHaveLength(1)
    })

    it('handles skip column markers', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_WASTE_RECEIVED',
            'OUR_REFERENCE',
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
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_SPARSE', 'COL_A', 'COL_B', 'COL_C'],
          [null, 'A1', null, 'C1'] // C2 is empty - intentionally null
        ]
      })

      expect(result.data.SPARSE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['COL_A', 'COL_B', 'COL_C'],
        rows: [['A1', null, 'C1']]
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
            '__EPR_DATA_UPDATE_WASTE_BALANCE',
            'OUR_REFERENCE',
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
          ['__EPR_DATA_WASTE_BALANCE', 'OUR_REFERENCE', 'WEIGHT'],
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
          ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
          [null, 12345, '2025-05-25'],
          [null, '', ''],
          [],
          ['__EPR_DATA_UPDATE_WASTE_BALANCE', 'SUPPLIER_REF', 'WEIGHT'],
          [null, 'ABC123', 100],
          [null, '', '']
        ]
      })

      await expect(result).rejects.toThrow(
        'Duplicate data section name: UPDATE_WASTE_BALANCE'
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
          ['__EPR_DATA_WASTE_RECEIVED', 'OUR_REFERENCE', 'DATE_RECEIVED'],
          [null, 12345678910, '2025-05-25'],
          [null, 98765432100, '2025-05-26'],
          [null, 11122233344, '2025-05-27']
        ]
      })

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
          [null, '__EPR_DATA_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
          [null, null, 12345678910, '2025-05-25'],
          [null, null, 98765432100, '2025-05-26']
        ]
      })

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
          ['value_a1', 'value_b1', 'value_c1'],
          ['value_a2', 'value_b2', 'value_c2']
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
          [5, 10],
          [7, 14]
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
          [null, '2025-05-25', 'ABC123'],
          [null, '2025-05-26', 'XYZ789']
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
          ['value1', 'value2', 'value3'],
          ['value4', 'value5', 'value6']
        ]
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
          ['value1', 'value2', 'value3'],
          [null, null, 'only_last_has_value'],
          ['value4', null, 'value5']
        ]
      })
    })
  })

  describe('date cells', () => {
    it('should extract Date object from metadata value', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      const testDate = new Date('2025-05-25')

      worksheet.getCell('A1').value = '__EPR_META_SUBMISSION_DATE'
      worksheet.getCell('B1').value = testDate

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.meta.SUBMISSION_DATE).toEqual({
        value: testDate,
        location: { sheet: 'Test', row: 1, column: 'B' }
      })
    })

    it('should extract Date objects from data rows', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      const date1 = new Date('2025-05-25')
      const date2 = new Date('2025-06-15')

      worksheet.getCell('A1').value = '__EPR_DATA_WASTE_RECEIVED'
      worksheet.getCell('B1').value = 'OUR_REFERENCE'
      worksheet.getCell('C1').value = 'DATE_RECEIVED'

      worksheet.getCell('B2').value = 12345678910
      worksheet.getCell('C2').value = date1

      worksheet.getCell('B3').value = 98765432100
      worksheet.getCell('C3').value = date2

      const buffer = await workbook.xlsx.writeBuffer()
      const result = await parse(buffer)

      expect(result.data.WASTE_RECEIVED).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [
          [12345678910, date1],
          [98765432100, date2]
        ]
      })
    })

    it('should handle dates in mixed data types', async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Test')

      const date = new Date('2025-05-25')

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
        rows: [['some text', date, 42]]
      })
    })
  })

  describe('metadata and data ordering', () => {
    it('should allow metadata after complete data section', async () => {
      const result = await parseWorkbook({
        Test: [
          ['__EPR_DATA_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
          [null, 12345678910, '2025-05-25'],
          [null, 98765432100, '2025-05-26'],
          [null, '', ''],
          ['__EPR_META_PROCESSING_TYPE', 'REPROCESSOR_INPUT'],
          ['__EPR_META_MATERIAL', 'Paper and board']
        ]
      })

      expect(result.data.WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [
          [12345678910, '2025-05-25'],
          [98765432100, '2025-05-26']
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
          ['__EPR_DATA_WASTE_BALANCE', 'OUR_REFERENCE', 'DATE_RECEIVED'],
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
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [
          [12345678910, '2025-05-25'],
          [98765432100, '2025-05-26'],
          [11122233344, '2025-05-27']
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
          ['ABC Ltd', 'ABC123'],
          ['XYZ Corp', 'XYZ789']
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
        rows: [['value_a1', 'value_b1']]
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
          ['value_x1', 'value_y1'],
          ['value_x2', 'value_y2']
        ]
      })
    })

    it('should handle metadata in same row as data marker', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_WASTE_BALANCE',
            'OUR_REFERENCE',
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
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [[12345678910, '2025-05-25']]
      })

      expect(result.meta.PROCESSING_TYPE).toEqual({
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Test', row: 1, column: 'F' }
      })
    })
  })
})
