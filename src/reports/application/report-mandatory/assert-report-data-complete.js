import { isFilled } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { badRequest } from '#common/helpers/logging/cdp-boom.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import { reportMandatoryPolicyFor } from '#reports/domain/report-mandatory/index.js'

/**
 * @import { TableSchema } from '#domain/summary-logs/table-schemas/index.js'
 * @import { ReportMandatoryRule } from '#reports/domain/report-mandatory/index.js'
 */

/**
 * The subset of a waste-record state the gate reads. A full `WasteRecordState`
 * is assignable to this.
 *
 * @typedef {object} CompletenessRow
 * @property {string} rowId
 * @property {string} processingType
 * @property {string} wasteRecordType
 * @property {Record<string, any>} data
 */

/**
 * One missing mandatory field: a single line item in the error payload. Each
 * unfilled field is its own issue, so `total` and the rendered list agree at
 * field granularity. `field` is the canonical name; the frontend maps it to a
 * label. `sheet`/`rowId` locate it and let the frontend group issues by
 * worksheet and row if it wants.
 *
 * @typedef {object} Issue
 * @property {string} sheet - The row's spreadsheet sheet name.
 * @property {string} rowId
 * @property {string} field
 */

/**
 * Collects one issue per unfilled mandatory field on a row. A rule contributes
 * when its trigger holds for the row, regardless of which report period the row
 * belongs to: the gate checks the whole summary log, not just the rows this
 * report aggregates. The required fields across a template's rules for a single
 * table are disjoint, so no de-duplication is needed.
 *
 * @param {CompletenessRow} row
 * @param {TableSchema} schema
 * @param {ReportMandatoryRule[]} rules
 * @returns {Issue[]}
 */
const issuesForRow = (row, schema, rules) => {
  /** @type {Issue[]} */
  const issues = []
  for (const rule of rules) {
    if (!rule.trigger(row.data)) {
      continue
    }
    for (const field of rule.requiredFields) {
      if (!isFilled(row.data[field], schema.unfilledValues[field] ?? [])) {
        issues.push({ sheet: schema.sheetName, rowId: row.rowId, field })
      }
    }
  }
  return issues
}

/**
 * Applies the report-mandatory policy to every row state, returning one issue
 * per unfilled mandatory field across the whole summary log. Rows whose
 * processing type has no policy (or whose record type has no rules) are skipped.
 * The row's table schema, drift-guarded against the policy, supplies the sheet
 * name and per-field unfilled values.
 *
 * @param {CompletenessRow[]} rows
 * @returns {Issue[]}
 */
export const findIssues = (rows) =>
  rows.flatMap((row) => {
    const rules = reportMandatoryPolicyFor(row.processingType)?.[
      row.wasteRecordType
    ]
    if (!rules) {
      return []
    }
    const schema = /** @type {TableSchema} */ (
      findSchemaForProcessingType(row.processingType, row.wasteRecordType)
    )
    return issuesForRow(row, schema, rules)
  })

/**
 * Upper bound on the number of issues carried in the error payload. The
 * frontend renders "we found {total} but can only display {N}" when the true
 * count exceeds this, so the payload stays bounded on a pathological summary log
 * while `total` keeps the count truthful.
 */
export const MAX_ISSUES_REPORTED = 100

/**
 * Throws a 400 Boom enriched with `code=report_data_incomplete` and a flat
 * `issues` payload if any mandatory field is missing anywhere in the summary
 * log. On success it returns silently and the report is created.
 *
 * `total` is the true number of missing fields; `issues` is capped at
 * `MAX_ISSUES_REPORTED`, so `total` can exceed `issues.length`.
 *
 * @param {CompletenessRow[]} rows
 * @param {string} reference - Ledger/registration reference for CDP log indexing.
 * @returns {void}
 */
export const assertReportDataComplete = (rows, reference) => {
  const issues = findIssues(rows)
  const total = issues.length
  if (total) {
    throw badRequest(
      `Report cannot be created; ${total} mandatory field(s) are missing`,
      errorCodes.reportDataIncomplete,
      {
        event: {
          action: 'create_report',
          reason: `missingFields=${total}`,
          reference
        },
        // `reason` discriminates this 400 from other bad-request payloads for
        // the frontend, matching the resubmission-rejection convention.
        payload: {
          reason: errorCodes.reportDataIncomplete,
          total,
          issues: issues.slice(0, MAX_ISSUES_REPORTED)
        }
      }
    )
  }
}
