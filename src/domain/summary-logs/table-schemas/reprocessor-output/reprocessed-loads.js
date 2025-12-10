import Joi from 'joi'
import { MESSAGES, ROW_ID_MINIMUMS, YES_NO_VALUES } from '../shared/index.js'
import { createRowIdSchema } from '../shared/row-id.schema.js'
import { REPROCESSED_LOADS_FIELDS as FIELDS } from './fields.js'
import {
  validateUkPackagingWeightProportion,
  UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES
} from './validators/uk-packaging-weight-proportion-validator.js'

/**
 * Maximum value for product tonnage field (in tonnes)
 *
 * Defined locally as this limit is specific to this table.
 */
const MAX_PRODUCT_TONNAGE = 1000

/**
 * Table schema for REPROCESSED_LOADS (REPROCESSOR_OUTPUT)
 *
 * Tracks waste that has been processed (output from reprocessing).
 */
export const REPROCESSED_LOADS = {
  rowIdField: FIELDS.ROW_ID,

  requiredHeaders: [
    FIELDS.ROW_ID,
    FIELDS.DATE_LOAD_LEFT_SITE,
    FIELDS.PRODUCT_TONNAGE,
    FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE,
    FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION,
    FIELDS.ADD_PRODUCT_WEIGHT
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
    FIELDS.ROW_ID,
    FIELDS.DATE_LOAD_LEFT_SITE,
    FIELDS.PRODUCT_TONNAGE,
    FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE,
    FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION,
    FIELDS.ADD_PRODUCT_WEIGHT
  ],

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.REPROCESSED_LOADS
    ).optional(),
    [FIELDS.DATE_LOAD_LEFT_SITE]: Joi.date().optional().messages({
      'date.base': MESSAGES.MUST_BE_A_VALID_DATE
    }),
    [FIELDS.PRODUCT_TONNAGE]: Joi.number()
      .min(0)
      .max(MAX_PRODUCT_TONNAGE)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1000
      }),
    [FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE]: Joi.number()
      .min(0)
      .max(1)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_ONE
      }),
    [FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION]: Joi.number()
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER
      }),
    [FIELDS.ADD_PRODUCT_WEIGHT]: Joi.string()
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
    FIELDS.PRODUCT_TONNAGE,
    FIELDS.DATE_LOAD_LEFT_SITE,
    FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE,
    FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION,
    FIELDS.ADD_PRODUCT_WEIGHT
  ]
}
