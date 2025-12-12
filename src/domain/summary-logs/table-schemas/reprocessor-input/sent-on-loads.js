import Joi from 'joi'
import {
  createRowIdSchema,
  createDateFieldSchema,
  createWeightFieldSchema
} from '../shared/index.js'
import { SENT_ON_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'

/**
 * Table schema for SENT_ON_LOADS
 *
 * Tracks waste sent on to other facilities.
 */
export const SENT_ON_LOADS = {
  rowIdField: FIELDS.ROW_ID,

  requiredHeaders: [
    FIELDS.ROW_ID,
    FIELDS.DATE_LOAD_LEFT_SITE,
    FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
  ],

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {},

  /**
   * Fields that produce FATAL errors when validation fails
   */
  fatalFields: [
    FIELDS.ROW_ID,
    FIELDS.DATE_LOAD_LEFT_SITE,
    FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
  ],

  /**
   * VAL010: Validation schema for filled fields
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.SENT_ON_LOADS
    ).optional(),
    [FIELDS.DATE_LOAD_LEFT_SITE]: createDateFieldSchema(),
    [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]: createWeightFieldSchema()
  })
    .unknown(true)
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   */
  fieldsRequiredForWasteBalance: [
    FIELDS.ROW_ID,
    FIELDS.DATE_LOAD_LEFT_SITE,
    FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
  ]
}
