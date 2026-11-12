import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, PARSE_DEFAULTS } from './exceljs-parser.js'

const TEMPLATES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../data/fixtures/spreadsheet/templates/V5'
)

const SUMMARY_LOG_PARSE_OPTIONS = {
  requiredWorksheet: 'Cover',
  ...PARSE_DEFAULTS
}

// Generous timeout so slow CI machines do not give false positives; these
// tests catch catastrophic regressions such as 30+ second hangs, not drift.
const TIMEOUT_MS = 50_000

/**
 * One template per test file so the three parses run on separate workers.
 * @param {string} fixture
 * @param {string} processingType
 */
export const describeTemplateParsePerformance = (fixture, processingType) =>
  describe('ExcelJS parser performance', () => {
    it(
      `should parse ${processingType} template`,
      { timeout: TIMEOUT_MS },
      async () => {
        const buffer = await readFile(path.join(TEMPLATES_DIR, fixture))

        const result = await parse(buffer, SUMMARY_LOG_PARSE_OPTIONS)

        expect(result.meta.PROCESSING_TYPE.value).toBe(processingType)
        expect(result.meta.TEMPLATE_VERSION.value).toBeDefined()
      }
    )
  })
