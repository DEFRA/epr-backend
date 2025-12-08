import Joi from 'joi'
import { MESSAGES, CONSTANTS, ROW_ID_MINIMUMS } from '../shared/index.js'
import { createRowIdSchema } from '../shared/row-id.schema.js'

/**
 * Table schema for REPROCESSED_LOADS (REPROCESSOR_OUTPUT)
 *
 * Tracks waste that has been processed (output from reprocessing).
 */
export const REPROCESSED_LOADS = {
  rowIdField: 'ROW_ID',

  requiredHeaders: ['ROW_ID', 'PRODUCT_TONNAGE'],

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {},

  /**
   * Fields that produce FATAL errors when validation fails
   *
   * ROW_ID is always fatal as it indicates tampering or corruption.
   * PRODUCT_TONNAGE is fatal per ticket requirements.
   */
  fatalFields: ['ROW_ID', 'PRODUCT_TONNAGE'],

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   */
  validationSchema: Joi.object({
    ROW_ID: createRowIdSchema(ROW_ID_MINIMUMS.REPROCESSED_LOADS).optional(),
    PRODUCT_TONNAGE: Joi.number()
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
  fieldsRequiredForWasteBalance: ['PRODUCT_TONNAGE']
}
