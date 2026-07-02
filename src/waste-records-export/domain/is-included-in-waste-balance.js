import { REGISTERED_ONLY_PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { CLASSIFICATION_REASON } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
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
    return { included: false, reasons: [], tonnage: null }
  }

  if (!accreditation) {
    return {
      included: false,
      reasons: [{ code: CLASSIFICATION_REASON.NOT_ACCREDITED }],
      tonnage: null
    }
  }

  if (REGISTERED_ONLY_PROCESSING_TYPES.has(record.data?.processingType)) {
    return {
      included: false,
      reasons: [
        { code: CLASSIFICATION_REASON.SUBMITTED_ON_REGISTERED_ONLY_TEMPLATE }
      ],
      tonnage: null
    }
  }

  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )

  if (!schema?.classifyForWasteBalance) {
    return {
      included: false,
      reasons: [
        { code: CLASSIFICATION_REASON.SECTION_NOT_INCLUDED_IN_WASTE_BALANCE }
      ],
      tonnage: null
    }
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
