import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

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
 * Returns the waste balance inclusion status and any exclusion reasons for a record.
 * Mirrors the same logic as the waste-balances calculation path.
 *
 * Returns `null` when inclusion cannot be computed for this record at all
 * (no accreditation, or no classification schema for the processing type —
 * which is also how registered-only templates are excluded, since their
 * table schemas never define `classifyForWasteBalance`) — these are
 * registration or template-level states, not a per-row classification
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
  if (record.excludedFromWasteBalance) {
    return { included: false, reasons: [], tonnage: null }
  }

  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )

  if (!accreditation || !schema?.classifyForWasteBalance) {
    return null
  }

  const result = schema.classifyForWasteBalance(record.data, {
    accreditation,
    overseasSites
  })

  if (result.outcome === ROW_OUTCOME.INCLUDED) {
    return { included: true, reasons: [], tonnage: result.transactionAmount }
  }

  return { included: false, reasons: result.reasons, tonnage: null }
}
