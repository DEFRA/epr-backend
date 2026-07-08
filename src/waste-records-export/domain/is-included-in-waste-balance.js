import {
  WASTE_BALANCE_OUTCOME,
  classifyRecordForWasteBalance
} from '#waste-balances/domain/waste-balance-classification.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {WasteBalanceClassificationReason} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */

/**
 * @typedef {Object} WasteBalanceClassification
 * @property {boolean} included - Whether the record is included in the waste balance
 * @property {WasteBalanceClassificationReason[]} reasons - Exclusion reasons; empty when included
 * @property {number | null} tonnage - Rounded waste balance tonnage; null when excluded
 */

/**
 * Returns the waste balance inclusion status and any exclusion reasons for a
 * record, adapting the shared waste-balance classification to the CSV export's
 * shape.
 *
 * Returns `null` when inclusion cannot be computed for this record at all — the
 * classification is not-applicable (no accreditation, or no classification
 * schema for the processing type, which is also how registered-only templates
 * are excluded since their table schemas never define `classifyForWasteBalance`).
 * These are registration or template-level states, not a per-row classification
 * outcome, so there is no meaningful reason code to report. The CSV export
 * renders `null` as "NA".
 *
 * @param {WasteRecord} record
 * @param {Accreditation | null} accreditation
 * @param {OverseasSitesContext} overseasSites
 * @returns {WasteBalanceClassification | null}
 */
export const getWasteBalanceClassification = (
  record,
  accreditation,
  overseasSites
) => {
  const { outcome, reasons, transactionAmount } = classifyRecordForWasteBalance(
    record,
    accreditation,
    overseasSites
  )

  if (outcome === WASTE_BALANCE_OUTCOME.NOT_APPLICABLE) {
    return null
  }

  if (outcome === WASTE_BALANCE_OUTCOME.INCLUDED) {
    return { included: true, reasons: [], tonnage: transactionAmount }
  }

  return { included: false, reasons, tonnage: null }
}
