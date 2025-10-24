import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ExcelJSSummaryLogsParser } from './exceljs-parser.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

describe('ExcelJSSummaryLogsParser', () => {
  let parser
  let excelBuffer

  beforeEach(async () => {
    parser = new ExcelJSSummaryLogsParser()
    excelBuffer = await readFile(
      path.join(dirname, '../../../data/fixtures/uploads/reprocessor.xlsx')
    )
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

  it('should parse Excel buffer and return empty metadata', async () => {
    const result = await parser.parse(excelBuffer)

    expect(result).toBeDefined()
    expect(result.meta).toBeDefined()
    expect(result.meta).toEqual({})
    expect(result.data).toBeDefined()
    expect(result.data).toEqual({})
  })

  it('should return consistent empty metadata', async () => {
    const result = await parser.parse(excelBuffer)

    expect(result.meta).toEqual({})
    expect(result.data).toEqual({})
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

      worksheet.getCell('A1').value = '__EPR_META_PROCESSING_TYPE'
      worksheet.getCell('B1').value = 'REPROCESSOR'

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

      sheet.getCell('A1').value = '__EPR_META_PROCESSING_TYPE'
      sheet.getCell('B1').value = 'REPROCESSOR'
      sheet.getCell('A2').value = '__EPR_META_MATERIAL'
      sheet.getCell('B2').value = 'Paper and board'

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

      sheet.getCell('A1').value = '__EPR_DATA_UPDATE_WASTE_BALANCE'
      sheet.getCell('B1').value = 'OUR_REFERENCE'
      sheet.getCell('C1').value = 'DATE_RECEIVED'

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

      sheet.getCell('A1').value = '__EPR_DATA_UPDATE_WASTE_BALANCE'
      sheet.getCell('B1').value = 'OUR_REFERENCE'
      sheet.getCell('C1').value = 'DATE_RECEIVED'
      sheet.getCell('D1').value = ''
      sheet.getCell('E1').value = 'IGNORED'

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

      sheet.getCell('A1').value = '__EPR_DATA_UPDATE_WASTE_BALANCE'
      sheet.getCell('B1').value = 'OUR_REFERENCE'
      sheet.getCell('C1').value = 'DATE_RECEIVED'
      sheet.getCell('B2').value = 12345678910
      sheet.getCell('C2').value = '2025-05-25'
      sheet.getCell('B3').value = 98765432100
      sheet.getCell('C3').value = '2025-05-26'

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

      sheet.getCell('A1').value = '__EPR_DATA_UPDATE_WASTE_BALANCE'
      sheet.getCell('B1').value = 'OUR_REFERENCE'
      sheet.getCell('C1').value = 'DATE_RECEIVED'
      sheet.getCell('B2').value = 12345678910
      sheet.getCell('C2').value = '2025-05-25'
      sheet.getCell('B3').value = ''
      sheet.getCell('C3').value = ''
      sheet.getCell('B4').value = 'This should be ignored'

      const buffer = await workbook.xlsx.writeBuffer()

      const parser = new ExcelJSSummaryLogsParser()
      const result = await parser.parse(buffer)

      expect(result.data.UPDATE_WASTE_BALANCE).toEqual({
        location: { sheet: 'Test', row: 1, column: 'B' },
        headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
        rows: [[12345678910, '2025-05-25']]
      })
    })
  })
})
