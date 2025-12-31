import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { extractWasteBalanceFields as extractExporterFields } from '#domain/waste-balances/table-schemas/exporter/validators/waste-balance-extractor.js'
import { extractWasteBalanceFields as extractReprocessorInputFields } from '#domain/waste-balances/table-schemas/reprocessor-input/validators/waste-balance-extractor.js'

/**
 * Extracts and validates waste balance fields from a record based on its processing type.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record - Record to extract from
 * @returns {import('#domain/waste-balances/table-schemas/exporter/validators/waste-balance-extractor.js').WasteBalanceFields | null} Extracted fields or null if invalid
 */
export const extractWasteBalanceFields = (record) => {
  const processingType = record.data?.processingType

  switch (processingType) {
    case PROCESSING_TYPES.EXPORTER:
      return extractExporterFields(record)
    case PROCESSING_TYPES.REPROCESSOR_INPUT:
      return extractReprocessorInputFields(record)
    default:
      return null
  }
}

/**
 * Checks if a dispatch date is within the accreditation date range.
 *
 * @param {Date} dispatchDate
 * @param {Object} accreditation
 * @returns {boolean}
 */
export const isWithinAccreditationDateRange = (dispatchDate, accreditation) => {
  const validFrom = new Date(accreditation.validFrom)
  const validTo = new Date(accreditation.validTo)

  return dispatchDate >= validFrom && dispatchDate <= validTo
}
