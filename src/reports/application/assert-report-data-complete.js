import { isFilled } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { badRequest } from '#common/helpers/logging/cdp-boom.js'
import { errorCodes } from '#reports/enums/error-codes.js'

/**
 * @import { ReportMandatorySpec } from './report-mandatory-rules.js'
 */

/**
 * The subset of a waste-record state the gate reads. A full
 * `WasteRecordState` is assignable to this.
 *
 * @typedef {object} CompletenessRow
 * @property {string} rowId
 * @property {string} wasteRecordType
 * @property {Record<string, any>} data
 */

/**
 * @typedef {object} IncompleteRow
 * @property {string} rowId
 * @property {string} wasteRecordType
 * @property {string[]} missingFields
 */

/**
 * Collects, for a single row, the mandatory fields left unfilled by any
 * triggered rule. A Set de-duplicates fields required by more than one rule
 * while preserving rule/field declaration order, so the response reads
 * predictably.
 *
 * @param {CompletenessRow} row
 * @param {ReportMandatorySpec} spec
 * @returns {string[]}
 */
const missingFieldsForRow = (row, { rules, unfilledValues }) => {
  const required = new Set()
  for (const rule of rules) {
    if (rule.trigger(row.data)) {
      for (const field of rule.requiredFields) {
        required.add(field)
      }
    }
  }
  return [...required].filter(
    (field) => !isFilled(row.data[field], unfilledValues[field] ?? [])
  )
}

/**
 * Applies a report-mandatory spec to every row state, returning one entry per
 * row that has at least one unfilled mandatory field.
 *
 * @param {CompletenessRow[]} rows
 * @param {ReportMandatorySpec} spec
 * @returns {IncompleteRow[]}
 */
export const findIncompleteRows = (rows, spec) =>
  rows
    .map((row) => ({
      rowId: row.rowId,
      wasteRecordType: row.wasteRecordType,
      missingFields: missingFieldsForRow(row, spec)
    }))
    .filter((row) => row.missingFields.length > 0)

/**
 * Throws a 400 Boom enriched with `code=report_data_incomplete` and a
 * per-row `incompleteRows` payload if any row is missing a mandatory field.
 * On success (no incomplete rows) it returns silently and no report is created.
 *
 * @param {CompletenessRow[]} rows
 * @param {ReportMandatorySpec} spec
 * @param {string} reference - Ledger/registration reference for CDP log indexing.
 * @returns {void}
 */
export const assertReportDataComplete = (rows, spec, reference) => {
  const incompleteRows = findIncompleteRows(rows, spec)
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
