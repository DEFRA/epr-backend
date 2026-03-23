import Joi from 'joi'
import { RECEIVED_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import {
  createRowIdSchema,
  createUnboundedWeightFieldSchema,
  createFirstOfMonthFieldSchema,
  createPercentageFieldSchema,
  createEnumFieldSchema,
  DROPDOWN_PLACEHOLDER,
  MESSAGES,
  RECYCLABLE_PROPORTION_METHODS
} from '../shared/index.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformReceivedLoadsRowRegisteredOnly } from '#application/waste-records/row-transformers/received-loads-reprocessing-registered-only.js'

const ALL_FIELDS = Object.values(FIELDS)

/**
 * Table schema for RECEIVED_LOADS_FOR_REPROCESSING (REPROCESSOR_REGISTERED_ONLY)
 *
 * Simplified version of the accredited reprocessor received loads table.
 * No waste balance calculation — all fields are supplementary.
 */
export const RECEIVED_LOADS_FOR_REPROCESSING = {
  rowIdField: FIELDS.ROW_ID,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  sheetName: 'Received',
  rowTransformer: transformReceivedLoadsRowRegisteredOnly,

  /**
   * VAL008: All columns that must be present in the uploaded file
   */
  requiredHeaders: ALL_FIELDS,

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: DROPDOWN_PLACEHOLDER,
    [FIELDS.MONTH_RECEIVED_FOR_REPROCESSING]: DROPDOWN_PLACEHOLDER
  },

  /**
   * VAL010: Validation schema for filled fields
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.RECEIVED_LOADS_FOR_REPROCESSING
    ),
    [FIELDS.MONTH_RECEIVED_FOR_REPROCESSING]: createFirstOfMonthFieldSchema(),
    [FIELDS.NET_WEIGHT]: createUnboundedWeightFieldSchema(),
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: createEnumFieldSchema(
      RECYCLABLE_PROPORTION_METHODS,
      MESSAGES.MUST_BE_VALID_RECYCLABLE_PROPORTION_METHOD
    ),
    [FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE]: createPercentageFieldSchema(),
    [FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING]: createUnboundedWeightFieldSchema()
  })
    .unknown(true)
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * Empty — registered-only operators have no waste balance.
   */
  fieldsRequiredForInclusionInWasteBalance: []
}
