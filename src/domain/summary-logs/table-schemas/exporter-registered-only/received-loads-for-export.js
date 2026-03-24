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
import { transformReceivedLoadsExportRowRegisteredOnly } from '#application/waste-records/row-transformers/received-loads-export-exporter-registered-only.js'
const ALL_FIELDS = Object.values(FIELDS)

/**
 * Table schema for RECEIVED_LOADS_FOR_EXPORT (EXPORTER_REGISTERED_ONLY)
 *
 * Simplified version of the accredited exporter received loads table.
 * No waste balance calculation — all fields are supplementary.
 * Export-specific fields (tonnage exported, OSR, Basel codes) are in LOADS_EXPORTED.
 */
export const RECEIVED_LOADS_FOR_EXPORT = {
  rowIdField: FIELDS.ROW_ID,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  sheetName: 'Received (section 1)',
  rowTransformer: transformReceivedLoadsExportRowRegisteredOnly,

  /**
   * VAL008: All columns that must be present in the uploaded file
   */
  requiredHeaders: ALL_FIELDS,

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: DROPDOWN_PLACEHOLDER,
    [FIELDS.MONTH_RECEIVED_FOR_EXPORT]: DROPDOWN_PLACEHOLDER
  },

  /**
   * VAL010: Validation schema for filled fields
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.RECEIVED_LOADS_FOR_EXPORT
    ),
    [FIELDS.MONTH_RECEIVED_FOR_EXPORT]: createFirstOfMonthFieldSchema(),
    [FIELDS.NET_WEIGHT]: createUnboundedWeightFieldSchema(),
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: createEnumFieldSchema(
      RECYCLABLE_PROPORTION_METHODS,
      MESSAGES.MUST_BE_VALID_RECYCLABLE_PROPORTION_METHOD
    ),
    [FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE]: createPercentageFieldSchema(),
    [FIELDS.TONNAGE_RECEIVED_FOR_EXPORT]: createUnboundedWeightFieldSchema()
  })
    .unknown(true)
    .prefs({ abortEarly: false })
}
