import Joi from 'joi'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  YES_NO_VALUES,
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createDateFieldSchema
} from '#domain/summary-logs/table-schemas/shared/index.js'
import {
  REPROCESSED_LOADS_FIELDS,
  SENT_ON_LOADS_FIELDS
} from '#domain/summary-logs/table-schemas/reprocessor-output/fields.js'

/**
 * Extracted waste balance fields.
 * @typedef {Object} WasteBalanceFields
 * @property {Date} dispatchDate
 * @property {boolean} prnIssued
 * @property {number} transactionAmount
 */

const reprocessedLoadsSchema = Joi.object({
  [REPROCESSED_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]:
    createDateFieldSchema().allow(null),
  [REPROCESSED_LOADS_FIELDS.ADD_PRODUCT_WEIGHT]:
    createYesNoFieldSchema().allow(null),
  [REPROCESSED_LOADS_FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION]:
    createWeightFieldSchema().allow(null),
  [REPROCESSED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
    createYesNoFieldSchema().allow(null)
})

const sentOnLoadsSchema = Joi.object({
  [SENT_ON_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]:
    createDateFieldSchema().allow(null),
  [SENT_ON_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]:
    createWeightFieldSchema().allow(null)
})

/**
 * Extracts and validates waste balance fields from a record.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record - Record to extract from
 * @returns {WasteBalanceFields | null} Extracted fields or null if invalid
 */
export const extractWasteBalanceFields = (record) => {
  const { data, type } = record
  const processingType = data?.processingType

  if (processingType !== PROCESSING_TYPES.REPROCESSOR_OUTPUT) {
    return null
  }

  if (type === WASTE_RECORD_TYPE.PROCESSED) {
    const { error, value } = reprocessedLoadsSchema.validate(data, {
      stripUnknown: true,
      abortEarly: false
    })

    if (error || !value[REPROCESSED_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]) {
      return null
    }

    if (
      value[REPROCESSED_LOADS_FIELDS.ADD_PRODUCT_WEIGHT] !== YES_NO_VALUES.YES
    ) {
      return null
    }

    return {
      dispatchDate: new Date(
        value[REPROCESSED_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]
      ),
      prnIssued:
        value[
          REPROCESSED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
        ] === YES_NO_VALUES.YES,
      transactionAmount:
        value[
          REPROCESSED_LOADS_FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION
        ] || 0
    }
  }

  if (type === WASTE_RECORD_TYPE.SENT_ON) {
    const { error, value } = sentOnLoadsSchema.validate(data, {
      stripUnknown: true,
      abortEarly: false
    })

    if (error || !value[SENT_ON_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]) {
      return null
    }

    return {
      dispatchDate: new Date(value[SENT_ON_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]),
      prnIssued: false,
      transactionAmount: -(
        value[SENT_ON_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON] || 0
      )
    }
  }

  return null
}
