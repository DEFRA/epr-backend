import { isFilled } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { isDateInRange } from '#reports/domain/aggregation/filter-records-by-date.js'
import { badRequest } from '#common/helpers/logging/cdp-boom.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import { reportMandatoryPolicyFor } from './index.js'

/**
 * @import { TableSchema } from '#domain/summary-logs/table-schemas/index.js'
 * @import { ReportingPeriod } from '#reports/domain/reporting-period.js'
 * @import { ReportMandatoryRule } from './index.js'
 * @import { RequiredByCode } from './reason-codes.js'
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
 * Collects the unfilled mandatory fields for one row. A rule contributes only
 * when the row falls in the report period by that rule's section date field
 * (strict period scoping, mirroring the aggregation) and the rule's trigger
 * holds. The required fields across a template's rules for a single table are
 * disjoint, so no de-duplication is needed.
 *
 * @param {CompletenessRow} row
 * @param {TableSchema} schema
 * @param {ReportMandatoryRule[]} rules
 * @param {ReportingPeriod} period
 * @returns {MissingField[]}
 */
const missingFieldsForRow = (row, schema, rules, period) => {
  /** @type {MissingField[]} */
  const missing = []
  for (const rule of rules) {
    if (
      !isDateInRange(row.data[rule.dateField], period) ||
      !rule.trigger(row.data)
    ) {
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
 * per row that has at least one unfilled mandatory field within the report
 * period. Rows whose processing type has no policy (or whose record type has no
 * rules) are skipped. The row's table schema, drift-guarded against the policy,
 * supplies the sheet name, column order and per-field unfilled values.
 *
 * @param {CompletenessRow[]} rows
 * @param {ReportingPeriod} period
 * @returns {IncompleteRow[]}
 */
export const findIncompleteRows = (rows, period) =>
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
    const missing = missingFieldsForRow(row, schema, rules, period)
    return missing.length
      ? [{ sheet: schema.sheetName, rowId: row.rowId, missing }]
      : []
  })

/**
 * Throws a 400 Boom enriched with `code=report_data_incomplete` and a per-row
 * `incompleteRows` payload if any row is missing a mandatory field within the
 * report period. On success it returns silently and the report is created.
 *
 * @param {CompletenessRow[]} rows
 * @param {ReportingPeriod} period
 * @param {string} reference - Ledger/registration reference for CDP log indexing.
 * @returns {void}
 */
export const assertReportDataComplete = (rows, period, reference) => {
  const incompleteRows = findIncompleteRows(rows, period)
  if (incompleteRows.length) {
    throw badRequest(
      `Report cannot be created; ${incompleteRows.length} row(s) have incomplete mandatory data`,
      errorCodes.reportDataIncomplete,
      {
        event: {
          action: 'create_report',
          reason: `incompleteRows=${incompleteRows.length}`,
          reference
        },
        // `reason` discriminates this 400 from other bad-request payloads for
        // the frontend, matching the resubmission-rejection convention.
        payload: { reason: errorCodes.reportDataIncomplete, incompleteRows }
      }
    )
  }
}
