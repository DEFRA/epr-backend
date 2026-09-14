/**
 * Writes the "Summary Log Rules Reference" to docs/summary-log-rules.md.
 * All the logic lives in the pure, testable module beside this file; this
 * wrapper only performs the file write, so regenerating is a single command:
 *   node scripts/generate-summary-log-rules.mjs
 *
 * Regenerate after any change to a table schema, field schema or
 * report-mandatory policy so the doc stays in step with the code.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateDocument } from './summary-log-rules.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(root, 'docs', 'summary-log-rules.md')
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, generateDocument())
process.stderr.write(`Wrote ${outputPath}\n`)
