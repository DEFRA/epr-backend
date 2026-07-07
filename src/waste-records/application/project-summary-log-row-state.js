import { classifyWasteRecord } from '#waste-balances/application/target-amount.js'
import { coerceStoredTonnages } from './stored-tonnage-coercion.js'

/**
 * @import { ClassifiedRow } from '#waste-balances/application/target-amount.js'
 */

/**
 * Project a waste record into its committed row state: classify it for the
 * waste balance, coerce the stored tonnages to two decimal places, and hold the
 * rowId as a string. Both are properties of the row-state value itself, so they
 * live here in the projection rather than at each write site — every path that
 * persists a row state goes through this seam and inherits the coercion. The
 * rowId is a row reference, not a number; a string holding matches the insert
 * schema and the forward-write transformer regardless of how the source record
 * stored it. The balance path keeps `classifyWasteRecord` directly and stays at
 * full precision, which the cross-field reconciliation arithmetic requires.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record
 * @param {Object} accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
 * @returns {ClassifiedRow}
 */
export const projectSummaryLogRowState = (
  record,
  accreditation,
  overseasSites
) => {
  const classified = classifyWasteRecord(record, accreditation, overseasSites)
  return {
    ...classified,
    rowId: String(classified.rowId),
    data: coerceStoredTonnages(classified.data)
  }
}
