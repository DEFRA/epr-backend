import Joi from 'joi'
import { MESSAGES, ROW_ID_MINIMUMS } from '../shared/index.js'
import { createRowIdSchema } from '../shared/row-id.schema.js'
import { SENT_ON_LOADS_FIELDS as FIELDS } from './fields.js'

/**
 * Maximum value for tonnage field (in tonnes)
 *
 * Defined locally as this limit is specific to this table.
 */
const MAX_TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON = 1000

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
    [FIELDS.DATE_LOAD_LEFT_SITE]: Joi.date().optional().messages({
      'date.base': MESSAGES.MUST_BE_A_VALID_DATE
    }),
    [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]: Joi.number()
      .min(0)
      .max(MAX_TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1000
      })
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
