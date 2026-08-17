import { isFilled } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { badRequest } from '#common/helpers/logging/cdp-boom.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import { reportMandatoryPolicyFor } from '#reports/domain/report-mandatory/index.js'

/**
 * @import { TableSchema } from '#domain/summary-logs/table-schemas/index.js'
 * @import { ReportMandatoryRule } from '#reports/domain/report-mandatory/index.js'
 * @import { RequiredByCode } from '#reports/domain/report-mandatory/reason-codes.js'
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
 * @typedef {object} MissingField
 * @property {string} field - Canonical field name (FE maps to label + column via its language file).
 * @property {RequiredByCode} requiredBy
 * @property {number} columnIndex - 0-based position of the field within its table's requiredHeaders.
 */

/**
 * @typedef {object} IncompleteRow
 * @property {string} sheet - The row's spreadsheet sheet name.
 * @property {string} rowId
 * @property {MissingField[]} missing
 */

/**
 * Collects the unfilled mandatory fields for one row. A rule contributes when
 * its trigger holds for the row, regardless of which report period the row
 * belongs to: the gate checks the whole summary log, not just the rows this
 * report aggregates. The required fields across a template's rules for a single
 * table are disjoint, so no de-duplication is needed.
 *
 * @param {CompletenessRow} row
 * @param {TableSchema} schema
 * @param {ReportMandatoryRule[]} rules
 * @returns {MissingField[]}
 */
const missingFieldsForRow = (row, schema, rules) => {
  /** @type {MissingField[]} */
  const missing = []
  for (const rule of rules) {
    if (!rule.trigger(row.data)) {
      continue
    }
    for (const field of rule.requiredFields) {
      if (!isFilled(row.data[field], schema.unfilledValues[field] ?? [])) {
        missing.push({
          field,
          requiredBy: rule.requiredBy,
          columnIndex: schema.requiredHeaders.indexOf(field)
        })
      }
    }
  }
  return missing
}

/**
 * Applies the report-mandatory policy to every row state, returning one entry
 * per row that has at least one unfilled mandatory field. Rows whose processing
 * type has no policy (or whose record type has no rules) are skipped. The row's
 * table schema, drift-guarded against the policy, supplies the sheet name,
 * column order and per-field unfilled values.
 *
 * @param {CompletenessRow[]} rows
 * @returns {IncompleteRow[]}
 */
export const findIncompleteRows = (rows) =>
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
    const missing = missingFieldsForRow(row, schema, rules)
    return missing.length
      ? [{ sheet: schema.sheetName, rowId: row.rowId, missing }]
      : []
  })

/**
 * Upper bound on the number of incomplete rows carried in the error payload.
 * The frontend renders "we found {total} but can only display {N}" when the
 * true count exceeds this, so the payload stays bounded on a pathological
 * summary log while `total` keeps the count truthful.
 */
export const MAX_INCOMPLETE_ROWS_REPORTED = 100

/**
 * Throws a 400 Boom enriched with `code=report_data_incomplete` and a per-row
 * `incompleteRows` payload if any row in the summary log is missing a mandatory
 * field. On success it returns silently and the report is created.
 *
 * `total` is the true number of incomplete rows; `incompleteRows` is capped at
 * `MAX_INCOMPLETE_ROWS_REPORTED`, so `total` can exceed `incompleteRows.length`.
 *
 * @param {CompletenessRow[]} rows
 * @param {string} reference - Ledger/registration reference for CDP log indexing.
 * @returns {void}
 */
export const assertReportDataComplete = (rows, reference) => {
  const incompleteRows = findIncompleteRows(rows)
  const total = incompleteRows.length
  if (total) {
    throw badRequest(
      `Report cannot be created; ${total} row(s) have incomplete mandatory data`,
      errorCodes.reportDataIncomplete,
      {
        event: {
          action: 'create_report',
          reason: `incompleteRows=${total}`,
          reference
        },
        // `reason` discriminates this 400 from other bad-request payloads for
        // the frontend, matching the resubmission-rejection convention.
        payload: {
          reason: errorCodes.reportDataIncomplete,
          total,
          incompleteRows: incompleteRows.slice(0, MAX_INCOMPLETE_ROWS_REPORTED)
        }
      }
    )
  }
}
