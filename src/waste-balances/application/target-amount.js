import {
  WASTE_BALANCE_OUTCOME,
  classifyRecordForWasteBalance
} from '#waste-balances/domain/waste-balance-classification.js'

/**
 * @import {WasteRecord, WasteRecordType} from '#domain/waste-records/model.js'
 * @import {RowClassificationContext, WasteBalanceClassification} from '#waste-balances/domain/waste-balance-classification.js'
 */

/**
 * A waste record paired with its waste-balance classification, retaining the
 * row identity and data so downstream consumers can persist row state and
 * balance membership without re-deriving them.
 *
 * @typedef {Object} ClassifiedRow
 * @property {string} rowId
 * @property {WasteRecordType} wasteRecordType
 * @property {Record<string, any>} data
 * @property {WasteBalanceClassification} classification
 */

/**
 * Pairs a waste record with its waste-balance classification, retaining the
 * row identity and data alongside.
 *
 * @param {WasteRecord} record
 * @param {RowClassificationContext} classificationContext
 * @returns {ClassifiedRow}
 */
export const classifyWasteRecord = (record, classificationContext) => ({
  rowId: record.rowId,
  wasteRecordType: record.type,
  data: record.data,
  classification: classifyRecordForWasteBalance(record, classificationContext)
})

/**
 * Per-record waste-balance contribution: the tonnage a classified row adds to
 * its accreditation's balance, or zero when the row is not INCLUDED. Consumed
 * when building the ledger events for a summary-log submission.
 *
 * @param {WasteBalanceClassification} classification
 * @returns {number}
 */
export const getTargetAmount = (classification) =>
  classification.outcome === WASTE_BALANCE_OUTCOME.INCLUDED
    ? classification.transactionAmount
    : 0
