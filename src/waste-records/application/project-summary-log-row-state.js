import { classifyWasteRecord } from '#waste-balances/application/target-amount.js'
import { coerceStoredTonnages } from './stored-tonnage-coercion.js'

/**
 * @import { SummaryLogRowStateEntry } from '#waste-records/repository/schema.js'
 */

/**
 * Project a waste record into its committed row state: classify it for the
 * waste balance, coerce the stored tonnages to two decimal places, and hold the
 * rowId as a string. These are properties of the row-state value itself, so they
 * live here in the projection rather than at each write site — every path that
 * persists a row state goes through this seam and inherits the shape. The
 * rowId is a row reference, not a number; a string holding matches the insert
 * schema and the forward-write transformer regardless of how the source record
 * stored it. `processingType` names the template the row reports under
 * rather than describing the load, so it is hoisted to a top-level field
 * alongside the record rather than kept inside the raw `data`; the redundant
 * `ROW_ID` copy is dropped in favour of the top-level
 * `rowId`. The balance path keeps
 * `classifyWasteRecord` directly and stays at full precision, which the
 * cross-field reconciliation arithmetic requires.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record
 * @param {Object} accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
 * @returns {SummaryLogRowStateEntry}
 */
export const projectSummaryLogRowState = (
  record,
  accreditation,
  overseasSites
) => {
  const classified = classifyWasteRecord(
    record,
    record.data?.processingType,
    accreditation,
    overseasSites
  )
  const { ROW_ID: _ROW_ID, processingType, ...data } = classified.data
  return {
    ...classified,
    rowId: String(classified.rowId),
    processingType,
    data: coerceStoredTonnages(data)
  }
}
