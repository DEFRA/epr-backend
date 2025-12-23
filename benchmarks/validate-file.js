/**
 * Diagnostic script to measure Excel parse AND validation time for a specific file.
 *
 * Usage:
 *   npm run benchmark:validate <path-to-xlsx-file>
 *
 * Example:
 *   npm run benchmark:validate ./src/data/fixtures/spreadsheet/templates/V5/Summary_Log_Exporter.xlsx
 *
 * This extends parse-file.js by also running data syntax validation,
 * similar to the characterisation tests but as a standalone diagnostic tool.
 * For parse-only benchmarking, use benchmark:parse instead.
 */
import { readFile, stat } from 'node:fs/promises'
import {
  parse,
  PARSE_DEFAULTS
} from '#adapters/parsers/summary-logs/exceljs-parser.js'
import { createDataSyntaxValidator } from '#application/summary-logs/validations/data-syntax.js'
import { PROCESSING_TYPE_TABLES } from '#domain/summary-logs/table-schemas/index.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

const filePath = process.argv[2]

if (!filePath) {
  console.error('Usage: npm run benchmark:validate <path-to-xlsx-file>')
  console.error(
    'Example: npm run benchmark:validate ./src/data/fixtures/spreadsheet/templates/V5/Summary_Log_Exporter.xlsx'
  )
  process.exit(1)
}

const fileStats = await stat(filePath)
const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2)

console.log(`File: ${filePath}`)
console.log(`Size: ${fileSizeMB} MB`)
console.log('')

// Phase 1: Parse
console.log('Phase 1: Parsing...')
const fileBuffer = await readFile(filePath)

const parseStart = performance.now()
const parsed = await parse(fileBuffer, PARSE_DEFAULTS)
const parseElapsed = performance.now() - parseStart

const metaCount = Object.keys(parsed.meta).length
const dataTableCount = Object.keys(parsed.data).length
const totalRows = Object.values(parsed.data).reduce(
  (sum, table) => sum + table.rows.length,
  0
)
const processingType = parsed.meta?.PROCESSING_TYPE?.value || 'UNKNOWN'

console.log(`  Parse time: ${(parseElapsed / 1000).toFixed(2)}s`)
console.log(`  Processing type: ${processingType}`)
console.log(`  Metadata fields: ${metaCount}`)
console.log(`  Data tables: ${dataTableCount}`)
console.log(`  Total rows: ${totalRows}`)
console.log('')

// Phase 2: Validation
console.log('Phase 2: Validating...')

const validateStart = performance.now()
const validateDataSyntax = createDataSyntaxValidator(PROCESSING_TYPE_TABLES)
const { validatedData, issues } = validateDataSyntax(parsed)
const validateElapsed = performance.now() - validateStart

console.log(`  Validation time: ${(validateElapsed / 1000).toFixed(2)}s`)
console.log('')

// Per-table breakdown with outcomes
console.log('Results by table:')
for (const [tableName, table] of Object.entries(validatedData.data)) {
  const rows = table.rows || []

  // Count outcomes
  const outcomes = {
    [ROW_OUTCOME.INCLUDED]: 0,
    [ROW_OUTCOME.EXCLUDED]: 0,
    [ROW_OUTCOME.REJECTED]: 0
  }

  for (const row of rows) {
    if (row.outcome) {
      outcomes[row.outcome] = (outcomes[row.outcome] || 0) + 1
    }
  }

  const included = outcomes[ROW_OUTCOME.INCLUDED]
  const excluded = outcomes[ROW_OUTCOME.EXCLUDED]
  const rejected = outcomes[ROW_OUTCOME.REJECTED]

  console.log(`  ${tableName}: ${rows.length} rows`)
  console.log(
    `    ${included} INCLUDED, ${excluded} EXCLUDED, ${rejected} REJECTED`
  )
}

// Issue summary
const counts = issues.getCounts()

console.log('')
console.log('Validation issues:')
console.log(
  `  ${counts.fatal} fatal, ${counts.error} errors, ${counts.warning} warnings`
)

// Summary
console.log('')
console.log('Summary:')
console.log(
  `  Total time: ${((parseElapsed + validateElapsed) / 1000).toFixed(2)}s`
)
console.log(
  `  Parse: ${((parseElapsed / (parseElapsed + validateElapsed)) * 100).toFixed(1)}%`
)
console.log(
  `  Validate: ${((validateElapsed / (parseElapsed + validateElapsed)) * 100).toFixed(1)}%`
)
console.log('')
console.log('Done!')
