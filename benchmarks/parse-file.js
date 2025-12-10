/**
 * Diagnostic script to measure Excel parse time for a specific file.
 *
 * Usage:
 *   npm run benchmark:file <path-to-xlsx-file>
 *
 * Example:
 *   npm run benchmark:file ./test-data/large-file.xlsx
 *
 * Useful for debugging performance issues with user-submitted files.
 */
import { readFile, stat } from 'node:fs/promises'
import {
  parse,
  PARSE_DEFAULTS
} from '#adapters/parsers/summary-logs/exceljs-parser.js'

const filePath = process.argv[2]

if (!filePath) {
  throw new Error('Usage: npm run benchmark:file <path-to-xlsx-file>')
}

const fileStats = await stat(filePath)
const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2)

console.log(`File: ${filePath}`)
console.log(`Size: ${fileSizeMB} MB`)
console.log('Loading file...')

const fileBuffer = await readFile(filePath)

console.log('Parsing...\n')

const start = performance.now()
const result = await parse(fileBuffer, PARSE_DEFAULTS)
const elapsed = performance.now() - start

const metaCount = Object.keys(result.meta).length
const dataTableCount = Object.keys(result.data).length
const totalRows = Object.values(result.data).reduce(
  (sum, table) => sum + table.rows.length,
  0
)

console.log('Results:')
console.log(`  Parse time: ${(elapsed / 1000).toFixed(2)}s`)
console.log(`  Metadata fields: ${metaCount}`)
console.log(`  Data tables: ${dataTableCount}`)
console.log(`  Total rows: ${totalRows}`)
console.log('\n✅ Parse completed')
