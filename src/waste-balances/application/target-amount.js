import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/**
 * @import {RowOutcome, WasteBalanceClassificationReason} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
 */

/**
 * A summary-log waste record's waste-balance classification: the outcome, the
 * reasons behind it, and the tonnage it contributes (zero unless INCLUDED).
 *
 * @typedef {Object} RowClassification
 * @property {RowOutcome} outcome
 * @property {WasteBalanceClassificationReason[]} reasons
 * @property {number} transactionAmount
 */

/**
 * A waste record paired with its waste-balance classification, retaining the
 * row identity and data so downstream consumers can persist row state and
 * balance membership without re-deriving them.
 *
 * @typedef {Object} ClassifiedRow
 * @property {string} rowId
 * @property {import('#domain/waste-records/model.js').WasteRecordType} wasteRecordType
 * @property {Record<string, any>} data
 * @property {RowClassification} classification
 */

/**
 * Classifies a single summary-log waste record for the waste balance, reusing
 * the coercion the table schema's `classifyForWasteBalance` already performs.
 * Records flagged out of the balance, or with no matching schema, are EXCLUDED
 * with no reasons and no contribution.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record
 * @param {Object} accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
 * @returns {RowClassification}
 */
const classify = (record, accreditation, overseasSites) => {
  if (record.excludedFromWasteBalance) {
    return { outcome: ROW_OUTCOME.EXCLUDED, reasons: [], transactionAmount: 0 }
  }
  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )
  if (!schema?.classifyForWasteBalance) {
    return { outcome: ROW_OUTCOME.EXCLUDED, reasons: [], transactionAmount: 0 }
  }
  const result = schema.classifyForWasteBalance(record.data, {
    accreditation,
    overseasSites
  })
  return {
    outcome: result.outcome,
    reasons: result.reasons,
    transactionAmount:
      result.outcome === ROW_OUTCOME.INCLUDED ? result.transactionAmount : 0
  }
}

/**
 * Pairs a waste record with its waste-balance classification, retaining the
 * row identity and data alongside.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record
 * @param {Object} accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
 * @returns {ClassifiedRow}
 */
export const classifyWasteRecord = (record, accreditation, overseasSites) => ({
  rowId: record.rowId,
  wasteRecordType: record.type,
  data: record.data,
  classification: classify(record, accreditation, overseasSites)
})

/**
 * Per-record waste-balance contribution: the tonnage a classified row adds to
 * its accreditation's balance, or zero when the row is not INCLUDED. Consumed
 * when building the ledger events for a summary-log submission.
 *
 * @param {RowClassification} classification
 * @returns {number}
 */
export const getTargetAmount = (classification) =>
  classification.outcome === ROW_OUTCOME.INCLUDED
    ? classification.transactionAmount
    : 0
