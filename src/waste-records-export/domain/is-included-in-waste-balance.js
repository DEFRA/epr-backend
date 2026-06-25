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
 */

/**
 * Returns the waste balance inclusion status and any exclusion reasons for a record.
 * Mirrors the same logic as the waste-balances calculation path.
 *
 * @param {WasteRecord} record
 * @param {Accreditation | null} accreditation
 * @param {OverseasSitesContext} overseasSites
 * @returns {WasteBalanceClassification}
 */
export const getWasteBalanceClassification = (
  record,
  accreditation,
  overseasSites
) => {
  if (record.excludedFromWasteBalance) {
    return { included: false, reasons: [] }
  }

  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )

  if (!schema?.classifyForWasteBalance) {
    return { included: false, reasons: [] }
  }

  const result = schema.classifyForWasteBalance(record.data, {
    accreditation,
    overseasSites
  })

  if (result.outcome === ROW_OUTCOME.INCLUDED) {
    return { included: true, reasons: [] }
  }

  return { included: false, reasons: result.reasons }
}
