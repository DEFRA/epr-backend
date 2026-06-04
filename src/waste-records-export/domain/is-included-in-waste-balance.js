import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { isRegisteredOnlyAccreditation } from '#domain/organisations/accreditation.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */

/**
 * Boolean version of waste-balances/application/calculator#getTargetAmount.
 * Returns true iff the record currently counts toward the waste balance for
 * its accreditation. Mirrors the same logic; differs only by returning a
 * boolean rather than a tonnage — including the registered-only accreditation
 * gate, so an accreditation that never reached an accredited state includes
 * no records.
 *
 * @param {WasteRecord} record
 * @param {Accreditation | null} accreditation
 * @param {OverseasSitesContext} overseasSites
 * @returns {boolean}
 */
export const isIncludedInWasteBalance = (
  record,
  accreditation,
  overseasSites
) => {
  if (record.excludedFromWasteBalance) {
    return false
  }

  if (isRegisteredOnlyAccreditation(accreditation)) {
    return false
  }

  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )

  if (!schema?.classifyForWasteBalance) {
    return false
  }

  const result = schema.classifyForWasteBalance(record.data, {
    accreditation,
    overseasSites
  })

  return result.outcome === ROW_OUTCOME.INCLUDED
}
