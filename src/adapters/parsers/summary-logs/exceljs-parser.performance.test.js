import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, PARSE_DEFAULTS } from './exceljs-parser.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

describe('ExcelJS parser performance', () => {
  // These tests verify that templates can be parsed within reasonable time limits.
  // The timeout is intentionally generous (30 seconds) to avoid false positives on
  // slower CI machines. The phantom row/column protection ensures templates with
  // extensive formatting don't cause exponential slowdowns.
  //
  // Typical parse times on development hardware: 2-3 seconds per template.
  // These tests catch catastrophic regressions (e.g., 30+ second hangs).

  const TEMPLATES_DIR = path.join(
    dirname,
    '../../../data/fixtures/spreadsheet/templates/V5'
  )

  const SUMMARY_LOG_PARSE_OPTIONS = {
    requiredWorksheet: 'Cover',
    ...PARSE_DEFAULTS
  }

  const TIMEOUT_MS = 50_000

  it.each([
    { fixture: 'Summary_Log_Exporter.xlsx', processingType: 'EXPORTER' },
    {
      fixture: 'Summary_Log_Reprocessor_Input.xlsx',
      processingType: 'REPROCESSOR_INPUT'
    },
    {
      fixture: 'Summary_Log_Reprocessor_Output.xlsx',
      processingType: 'REPROCESSOR_OUTPUT'
    }
  ])(
    'should parse $processingType template',
    { timeout: TIMEOUT_MS },
    async ({ fixture, processingType }) => {
      const buffer = await readFile(path.join(TEMPLATES_DIR, fixture))

      const result = await parse(buffer, SUMMARY_LOG_PARSE_OPTIONS)

      expect(result.meta.PROCESSING_TYPE.value).toBe(processingType)
      expect(result.meta.TEMPLATE_VERSION.value).toBeDefined()
    }
  )
})
