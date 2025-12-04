import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'

import { MATERIAL_PLACEHOLDER_TEXT } from '@epr-backend/domain-summary-logs/markers'
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

  describe('reprocessor.xlsx fixture', () => {
    it(
      'should parse metadata and data sections',
      { timeout: 30000 },
      async () => {
        const excelBuffer = await readFile(
          path.join(dirname, '../fixtures/reprocessor.xlsx')
        )
        const result = await parse(excelBuffer)

        // Metadata
        expect(result.meta.PROCESSING_TYPE.value).toBe('REPROCESSOR_INPUT')
        expect(result.meta.TEMPLATE_VERSION.value).toBe(3)
        expect(result.meta.MATERIAL.value).toBe('Paper_and_board')
        expect(result.meta.ACCREDITATION_NUMBER.value).toBe('ACC123456')
        expect(result.meta.REGISTRATION_NUMBER.value).toBe('R25SR500030912PA')

        // Data sections exist with correct headers
        expect(result.data.RECEIVED_LOADS_FOR_REPROCESSING).toBeDefined()
        expect(result.data.RECEIVED_LOADS_FOR_REPROCESSING.headers).toContain(
          'ROW_ID'
        )

        expect(result.data.REPROCESSED_LOADS).toBeDefined()
        expect(result.data.SENT_ON_LOADS).toBeDefined()
      }
    )
  })

  it('should throw error for invalid Excel buffer', async () => {
    const invalidBuffer = Buffer.from('not an excel file')

    await expect(parse(invalidBuffer)).rejects.toThrow()
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
          [12345678910, '2025-05-25'],
          [98765432100, '2025-05-26']
        ]
      })
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
        rows: [[12345678910, '2025-05-25', null, 'ABC123', 'Joe Blogs']]
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

  describe('skip row functionality', () => {
    it('should skip rows where skip column contains "Example" text', async () => {
      const result = await parseWorkbook({
        Test: [
          [
            '__EPR_DATA_SENT_ON',
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

      expect(result.data.SENT_ON).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['ROW_ID', null, 'DATE_LOAD_LEFT_SITE', 'WEIGHT'],
        rows: [
          ['row-2', null, '2024-01-16', 200],
          ['row-3', null, '2024-01-17', 300]
        ]
      })
    })
  })
})
