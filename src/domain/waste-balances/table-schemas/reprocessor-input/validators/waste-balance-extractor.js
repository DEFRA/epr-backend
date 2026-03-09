import Joi from 'joi'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  YES_NO_VALUES,
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createDateFieldSchema
} from '#domain/summary-logs/table-schemas/shared/index.js'
import { RECEIVED_LOADS_FIELDS as RECEIVED_LOADS_FOR_REPROCESSING_FIELDS } from '#domain/summary-logs/table-schemas/reprocessor-input/fields.js'
import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

/**
 * Extracted waste balance fields.
 * @typedef {Object} WasteBalanceFields
 * @property {Date} dispatchDate
 * @property {boolean} prnIssued
 * @property {number} transactionAmount
 */

/**
 * Joi schema for extracting and validating received loads fields.
 */
const receivedLoadsSchema = Joi.object({
  [RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.DATE_RECEIVED_FOR_REPROCESSING]:
    createDateFieldSchema().allow(null),
  [RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
    createYesNoFieldSchema().allow(null),
  [RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING]:
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

  if (processingType !== PROCESSING_TYPES.REPROCESSOR_INPUT) {
    return null
  }

  if (type !== WASTE_RECORD_TYPE.RECEIVED) {
    return null
  }

  const { error, value } = receivedLoadsSchema.validate(data, {
    stripUnknown: true,
    abortEarly: false
  })

  if (
    error ||
    !value[
      RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.DATE_RECEIVED_FOR_REPROCESSING
    ]
  ) {
    return null
  }

  return {
    dispatchDate: new Date(
      value[
        RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.DATE_RECEIVED_FOR_REPROCESSING
      ]
    ),
    prnIssued:
      value[
        RECEIVED_LOADS_FOR_REPROCESSING_FIELDS
          .WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
      ] === YES_NO_VALUES.YES,
    transactionAmount: roundToTwoDecimalPlaces(
      value[
        RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING
      ]
    )
  }
}
