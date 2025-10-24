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

  it('should parse Excel buffer and return a workbook', async () => {
    const workbook = await parser.parse(excelBuffer)

    expect(workbook).toBeDefined()
    expect(workbook.worksheets).toBeDefined()
    expect(Array.isArray(workbook.worksheets)).toBe(true)
  })

  it('should load workbook with accessible worksheets', async () => {
    const workbook = await parser.parse(excelBuffer)

    expect(workbook.worksheets.length).toBeGreaterThan(0)
  })

  it('should throw error for invalid Excel buffer', async () => {
    const invalidBuffer = Buffer.from('not an excel file')

    await expect(parser.parse(invalidBuffer)).rejects.toThrow()
  })

  it('should handle empty buffer', async () => {
    const emptyBuffer = Buffer.from('')

    await expect(parser.parse(emptyBuffer)).rejects.toThrow()
  })
})
