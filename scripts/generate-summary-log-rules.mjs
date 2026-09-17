/**
 * Prints the "Summary Log Rules Reference" (Markdown) to stdout. All the logic
 * lives in the pure, testable module beside this file. The canonical copy is
 * checked into the epr-re-ex-service (binder) docs, not this repo, so regenerate
 * with a redirect into that file:
 *   node scripts/generate-summary-log-rules.mjs \
 *     > ../../epr-re-ex-service/docs/architecture/defined/summary-log-rules.md
 *
 * Regenerate after any change to a table schema, field schema or
 * report-mandatory policy so the doc stays in step with the code.
 */
import { generateDocument } from './summary-log-rules.mjs'

process.stdout.write(generateDocument())
