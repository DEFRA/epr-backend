import Joi from 'joi'
import {
  CONSTANTS,
  MESSAGES,
  ROW_ID_MINIMUMS,
  YES_NO_VALUES
} from '../shared/index.js'
import { createRowIdSchema } from '../shared/row-id.schema.js'
import {
  validateUkPackagingWeightProportion,
  UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES
} from './uk-packaging-weight-proportion-validator.js'

/**
 * Table schema for REPROCESSED_LOADS (REPROCESSOR_OUTPUT)
 *
 * Tracks waste that has been processed (output from reprocessing).
 */
export const REPROCESSED_LOADS = {
  rowIdField: 'ROW_ID',

  requiredHeaders: [
    'ROW_ID',
    'DATE_LOAD_LEFT_SITE',
    'PRODUCT_TONNAGE',
    'UK_PACKAGING_WEIGHT_PERCENTAGE',
    'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
    'ADD_PRODUCT_WEIGHT'
  ],

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {},

  /**
   * Fields that produce FATAL errors when validation fails
   *
   * ROW_ID is always fatal as it indicates tampering or corruption.
   * All other fields are fatal per ticket requirements (in-sheet revalidation).
   */
  fatalFields: [
    'ROW_ID',
    'DATE_LOAD_LEFT_SITE',
    'PRODUCT_TONNAGE',
    'UK_PACKAGING_WEIGHT_PERCENTAGE',
    'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
    'ADD_PRODUCT_WEIGHT'
  ],

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   */
  validationSchema: Joi.object({
    ROW_ID: createRowIdSchema(ROW_ID_MINIMUMS.REPROCESSED_LOADS).optional(),
    DATE_LOAD_LEFT_SITE: Joi.date().optional().messages({
      'date.base': MESSAGES.MUST_BE_A_VALID_DATE
    }),
    PRODUCT_TONNAGE: Joi.number()
      .min(CONSTANTS.ZERO)
      .max(CONSTANTS.MAX_PRODUCT_TONNAGE)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1000
      }),
    UK_PACKAGING_WEIGHT_PERCENTAGE: Joi.number()
      .min(CONSTANTS.ZERO)
      .max(CONSTANTS.ONE)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_ONE
      }),
    PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: Joi.number().optional().messages({
      'number.base': MESSAGES.MUST_BE_A_NUMBER
    }),
    ADD_PRODUCT_WEIGHT: Joi.string()
      .valid(YES_NO_VALUES.YES, YES_NO_VALUES.NO)
      .optional()
      .messages({
        'any.only': MESSAGES.MUST_BE_YES_OR_NO
      })
  })
    .custom(validateUkPackagingWeightProportion)
    .messages(UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES)
    .unknown(true)
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * A load will only be added to your waste balance when you provide
   * all the information in this section.
   */
  fieldsRequiredForWasteBalance: [
    'PRODUCT_TONNAGE',
    'DATE_LOAD_LEFT_SITE',
    'UK_PACKAGING_WEIGHT_PERCENTAGE',
    'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
    'ADD_PRODUCT_WEIGHT'
  ]
}
