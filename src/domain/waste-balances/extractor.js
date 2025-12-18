import Joi from 'joi'
import {
  createDateFieldSchema,
  createYesNoFieldSchema,
  createWeightFieldSchema
} from '#domain/summary-logs/table-schemas/shared/field-schemas.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { YES_NO_VALUES } from '#domain/summary-logs/table-schemas/shared/index.js'

/**
 * Extracted waste balance fields for an exporter.
 * @typedef {Object} ExporterWasteBalanceFields
 * @property {string} dateOfExport
 * @property {boolean} prnIssued
 * @property {boolean} interimSite
 * @property {number} interimTonnage
 * @property {number} exportTonnage
 */

/**
 * Joi schema for extracting and validating exporter waste balance fields.
 */
const exporterWasteBalanceFieldsSchema = Joi.object({
  [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: createDateFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
    createYesNoFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]:
    createYesNoFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]:
    createWeightFieldSchema().allow(null).required(),
  [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]:
    createWeightFieldSchema().allow(null).required()
})

/**
 * Extracts and validates waste balance fields from a row for an exporter.
 *
 * @param {Record<string, unknown>} row - Row data to extract from
 * @returns {ExporterWasteBalanceFields | null} Extracted fields or null if invalid
 */
export const extractExporterWasteBalanceFields = (row) => {
  const { error, value } = exporterWasteBalanceFieldsSchema.validate(row, {
    stripUnknown: true,
    abortEarly: true
  })

  if (error) {
    return null
  }

  return {
    date: value[RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT].toISOString(),
    prnIssued:
      value[RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE] ===
      YES_NO_VALUES.YES,
    interimSite:
      value[RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE] ===
      YES_NO_VALUES.YES,
    interimTonnage:
      value[
        RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR
      ] || 0,
    exportTonnage:
      value[RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED] || 0
  }
}

/**
 * Extracts waste balance fields based on processing type.
 *
 * @param {Record<string, unknown>} row - Row data to extract from
 * @returns {ExporterWasteBalanceFields | null} Extracted fields or null if invalid/unsupported
 */
export const extractWasteBalanceFields = (row) => {
  const processingType = row.processingType

  if (processingType === PROCESSING_TYPES.EXPORTER) {
    return extractExporterWasteBalanceFields(row)
  }

  return null
}
