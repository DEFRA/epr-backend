import { findSchemaByWasteRecordType } from '#domain/summary-logs/table-schemas/index.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/**
 * @import {AccreditationValidity} from '#domain/organisations/accreditation.js'
 * @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js'
 * @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
 * @import {WasteBalanceClassificationReason} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
 * @import {WasteRecord} from '#domain/waste-records/model.js'
 */

/**
 * Waste-balance classification outcomes. INCLUDED, EXCLUDED and IGNORED are the
 * per-row outcomes a table schema's `classifyForWasteBalance` produces, kept
 * string-identical to the shared validation `ROW_OUTCOME` so schema results map
 * straight through. NOT_APPLICABLE is waste-balance-specific: the record's
 * registration or template cannot contribute a per-row decision at all — there
 * is no accreditation, or the table schema has no waste-balance classifier
 * (which also covers registered-only templates).
 */
export const WASTE_BALANCE_OUTCOME = Object.freeze({
  INCLUDED: ROW_OUTCOME.INCLUDED,
  EXCLUDED: ROW_OUTCOME.EXCLUDED,
  IGNORED: ROW_OUTCOME.IGNORED,
  NOT_APPLICABLE: 'NOT_APPLICABLE'
})

/** @typedef {typeof WASTE_BALANCE_OUTCOME[keyof typeof WASTE_BALANCE_OUTCOME]} WasteBalanceOutcome */

/**
 * A record's waste-balance classification: the outcome, the reasons behind it,
 * and the tonnage it contributes (zero unless INCLUDED).
 *
 * @typedef {Object} WasteBalanceClassification
 * @property {WasteBalanceOutcome} outcome
 * @property {WasteBalanceClassificationReason[]} reasons
 * @property {number} transactionAmount
 */

/**
 * Classify a waste record for the waste balance. NOT_APPLICABLE takes
 * precedence: a record with no accreditation, or whose table schema has no
 * waste-balance classifier, cannot yield a per-row decision at all. Otherwise
 * the table schema's classifier decides the outcome — including whether the row
 * holds the fields the balance needs to read it — and only an INCLUDED row
 * contributes tonnage.
 *
 * The table schemas are those of the template the record reports under: the
 * template for the summary log's year and processing type. They arrive as
 * context instead of being read back out of the row's own data.
 *
 * @param {Pick<WasteRecord, 'type' | 'data'>} record
 * @param {Record<string, TableSchema>} tableSchemas
 * @param {AccreditationValidity | null} accreditation
 * @param {OverseasSitesContext} overseasSites
 * @returns {WasteBalanceClassification}
 */
export const classifyRecordForWasteBalance = (
  record,
  tableSchemas,
  accreditation,
  overseasSites
) => {
  const schema = findSchemaByWasteRecordType(record.type, tableSchemas)?.schema

  if (!accreditation || !schema?.classifyForWasteBalance) {
    return {
      outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
      reasons: [],
      transactionAmount: 0
    }
  }

  const result = schema.classifyForWasteBalance(record.data, {
    accreditation,
    overseasSites
  })
  return {
    outcome: result.outcome,
    reasons: result.reasons,
    transactionAmount:
      result.outcome === WASTE_BALANCE_OUTCOME.INCLUDED
        ? result.transactionAmount
        : 0
  }
}
