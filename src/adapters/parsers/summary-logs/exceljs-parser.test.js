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

  it('should parse Excel buffer and return hardcoded metadata', async () => {
    const result = await parser.parse(excelBuffer)

    expect(result).toBeDefined()
    expect(result.meta).toBeDefined()
    expect(result.meta.WASTE_REGISTRATION_NUMBER).toBeDefined()
    expect(result.meta.WASTE_REGISTRATION_NUMBER.value).toBe('WRN-123')
  })

  it('should return consistent hardcoded data', async () => {
    const result = await parser.parse(excelBuffer)

    expect(result.meta.WASTE_REGISTRATION_NUMBER.value).toBe('WRN-123')
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
