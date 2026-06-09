import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {WasteRecord, WasteRecordVersion} from '#domain/waste-records/model.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

/**
 * @typedef {Object} ClassificationContext
 * @property {Accreditation | null} accreditation
 * @property {OverseasSitesContext} overseasSites
 */

/**
 * @typedef {{ oldAmount: number, newAmount: number }} TransactionAmounts
 */

/** @param {ValidatedWasteRecord['record']} record */
export const recordKey = (record) => `${record.type}:${record.rowId}`

/**
 * Computes the transaction amount for a record via classifyForWasteBalance.
 * Returns 0 if the result is not INCLUDED.
 *
 * @param {TableSchema | null} schema
 * @param {Record<string, any>} data
 * @param {ClassificationContext} context
 * @returns {number}
 */
const getTransactionAmount = (schema, data, context) => {
  const result = schema?.classifyForWasteBalance?.(data, context)
  return result?.outcome === ROW_OUTCOME.INCLUDED ? result.transactionAmount : 0
}

/**
 * Builds a map of "type:rowId" => tonnage impact for included waste-balance records.
 *
 * For added records, the impact is the full transaction amount.
 * For adjusted records, the impact is the delta: new amount minus old amount.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords
 * @param {string} params.summaryLogId
 * @param {Map<string, WasteRecord>} params.existingRecordsMap
 * @param {(wasteRecordType: string) => import('#domain/summary-logs/table-schemas/index.js').TableSchema | null} params.findSchema
 * @param {ClassificationContext} params.context
 * @returns {Map<string, TransactionAmounts>}
 */
export const buildTransactionAmounts = ({
  wasteBalanceRecords,
  summaryLogId,
  existingRecordsMap,
  findSchema,
  context
}) => {
  /** @type {Map<string, TransactionAmounts>} */
  const amounts = new Map()

  for (const { record, outcome } of wasteBalanceRecords) {
    const entry = computeRecordAmounts(
      record,
      outcome,
      summaryLogId,
      existingRecordsMap,
      findSchema,
      context
    )
    if (entry) {
      amounts.set(recordKey(record), entry)
    }
  }

  return amounts
}

/**
 * @param {ValidatedWasteRecord['record']} record
 * @param {string} outcome
 * @param {string} summaryLogId
 * @param {Map<string, WasteRecord>} existingRecordsMap
 * @param {(wasteRecordType: string) => import('#domain/summary-logs/table-schemas/index.js').TableSchema | null} findSchema
 * @param {ClassificationContext} context
 * @returns {TransactionAmounts | null}
 */
const computeRecordAmounts = (
  record,
  outcome,
  summaryLogId,
  existingRecordsMap,
  findSchema,
  context
) => {
  const schema = findSchema(record.type)
  const isIncluded = outcome === ROW_OUTCOME.INCLUDED
  const newAmount = isIncluded
    ? getTransactionAmount(schema, record.data, context)
    : 0

  const lastVersion = /** @type {WasteRecordVersion} */ (record.versions.at(-1))
  const isAdjusted =
    lastVersion.summaryLog?.id === summaryLogId &&
    lastVersion.status === VERSION_STATUS.UPDATED

  if (isAdjusted) {
    const existing = existingRecordsMap.get(recordKey(record))
    const oldAmount = existing
      ? getTransactionAmount(schema, existing.data, context)
      : 0
    return newAmount === 0 && oldAmount === 0 ? null : { oldAmount, newAmount }
  }

  return newAmount === 0 ? null : { oldAmount: 0, newAmount }
}
