import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/**
 * Per-record waste-balance contribution shared between the embedded
 * calculator (records the delta on each summary-log row) and the
 * authoritative-sources rebuild (reproduces the totals from the same
 * inputs). Both must consult the same classification, otherwise the
 * stored embedded balance and its rebuilt counterpart drift apart.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record
 * @param {Object} accreditation
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} overseasSites
 * @returns {number}
 */
export const getTargetAmount = (record, accreditation, overseasSites) => {
  if (record.excludedFromWasteBalance) {
    return 0
  }
  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )
  if (!schema?.classifyForWasteBalance) {
    return 0
  }
  const result = schema.classifyForWasteBalance(record.data, {
    accreditation,
    overseasSites
  })
  return result.outcome === ROW_OUTCOME.INCLUDED ? result.transactionAmount : 0
}
