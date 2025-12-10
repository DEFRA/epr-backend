import Joi from 'joi'
import { MESSAGES, CONSTANTS, ROW_ID_MINIMUMS } from '../shared/index.js'
import { createRowIdSchema } from '../shared/row-id.schema.js'

/**
 * Table schema for SENT_ON_LOADS
 *
 * Tracks waste sent on to other facilities.
 */
export const SENT_ON_LOADS = {
  rowIdField: 'ROW_ID',

  requiredHeaders: [
    'ROW_ID',
    'DATE_LOAD_LEFT_SITE',
    'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
  ],

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {},

  /**
   * Fields that produce FATAL errors when validation fails
   */
  fatalFields: [
    'ROW_ID',
    'DATE_LOAD_LEFT_SITE',
    'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
  ],

  /**
   * VAL010: Validation schema for filled fields
   */
  validationSchema: Joi.object({
    ROW_ID: createRowIdSchema(ROW_ID_MINIMUMS.SENT_ON_LOADS).optional(),
    DATE_LOAD_LEFT_SITE: Joi.date().optional().messages({
      'date.base': MESSAGES.MUST_BE_A_VALID_DATE
    }),
    TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: Joi.number()
      .min(CONSTANTS.ZERO)
      .max(CONSTANTS.MAX_PRODUCT_TONNAGE)
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
  fieldsRequiredForWasteBalance: []
}
