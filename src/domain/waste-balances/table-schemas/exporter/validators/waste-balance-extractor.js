import Joi from 'joi'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  YES_NO_VALUES,
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createDateFieldSchema
} from '#domain/summary-logs/table-schemas/shared/index.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'

/**
 * Extracted waste balance fields.

 * @typedef {Object} WasteBalanceFields

 * @property {Date} dispatchDate
 * @property {boolean} prnIssued
 * @property {number} transactionAmount
 */

/**
 * Joi schema for extracting and validating waste balance fields.
 */
const wasteBalanceFieldsSchema = Joi.object({
  [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: createDateFieldSchema().allow(null),
  [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
    createYesNoFieldSchema().allow(null),
  [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]:
    createYesNoFieldSchema().allow(null),
  [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]:
    createWeightFieldSchema().allow(null),
  [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]:
    createWeightFieldSchema().allow(null)
})

/**
 * Extracts and validates waste balance fields from a record.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record - Record to extract from
 * @returns {WasteBalanceFields | null} Extracted fields or null if invalid
 */
export const extractWasteBalanceFields = (record) => {
  const { data } = record
  const processingType = data?.processingType

  if (processingType !== PROCESSING_TYPES.EXPORTER) {
    return null
  }

  const { error, value } = wasteBalanceFieldsSchema.validate(data, {
    stripUnknown: true,
    abortEarly: false
  })

  if (error || !value[RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]) {
    return null
  }

  const interimSite =
    value[RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE] ===
    YES_NO_VALUES.YES

  return {
    dispatchDate: new Date(value[RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]),
    prnIssued:
      value[RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE] ===
      YES_NO_VALUES.YES,
    transactionAmount:
      (interimSite
        ? value[
            RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR
          ]
        : value[
            RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED
          ]) || 0
  }
}
