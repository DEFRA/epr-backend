import Joi from 'joi'
import { MESSAGES, PATTERNS, CONSTANTS } from '../shared/index.js'
import { createRowIdSchema } from '../shared/row-id.schema.js'

/**
 * Table schema for RECEIVED_LOADS_FOR_REPROCESSING
 *
 * Tracks waste received for reprocessing. This schema defines:
 * - What counts as "unfilled" per field (unfilledValues)
 * - How to validate filled fields (validationSchema for VAL010)
 * - Which fields must be present for Waste Balance (fieldsRequiredForWasteBalance for VAL011)
 */
export const RECEIVED_LOADS_FOR_REPROCESSING = {
  rowIdField: 'ROW_ID',

  requiredHeaders: [
    'ROW_ID',
    'DATE_RECEIVED_FOR_REPROCESSING',
    'EWC_CODE',
    'GROSS_WEIGHT',
    'TARE_WEIGHT',
    'PALLET_WEIGHT',
    'NET_WEIGHT',
    'BAILING_WIRE_PROTOCOL',
    'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
    'WEIGHT_OF_NON_TARGET_MATERIALS',
    'RECYCLABLE_PROPORTION_PERCENTAGE',
    'TONNAGE_RECEIVED_FOR_RECYCLING'
  ],

  /**
   * Per-field values that indicate "unfilled"
   *
   * Fields not listed use the default empty check (null, undefined, '').
   * Listed fields additionally treat these specific values as unfilled,
   * typically dropdown placeholder values from the Excel template.
   */
  unfilledValues: {
    // Add dropdown placeholders here as we discover them
    // e.g. MATERIAL_TYPE: ['Please select...']
  },

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   * Any failure here results in REJECTED (blocks entire submission).
   */
  validationSchema: Joi.object({
    ROW_ID: createRowIdSchema().optional(),
    DATE_RECEIVED_FOR_REPROCESSING: Joi.date().optional().messages({
      'date.base': MESSAGES.MUST_BE_A_VALID_DATE
    }),
    EWC_CODE: Joi.string().pattern(PATTERNS.EWC_CODE).optional().messages({
      'string.base': MESSAGES.MUST_BE_A_STRING,
      'string.pattern.base': 'must be in format "XX XX XX" (e.g. "03 03 08")'
    }),
    GROSS_WEIGHT: Joi.number().greater(CONSTANTS.ZERO).optional().messages({
      'number.base': MESSAGES.MUST_BE_A_NUMBER,
      'number.greater': MESSAGES.MUST_BE_GREATER_THAN_ZERO
    }),
    TARE_WEIGHT: Joi.number().greater(CONSTANTS.ZERO).optional().messages({
      'number.base': MESSAGES.MUST_BE_A_NUMBER,
      'number.greater': MESSAGES.MUST_BE_GREATER_THAN_ZERO
    }),
    PALLET_WEIGHT: Joi.number().greater(CONSTANTS.ZERO).optional().messages({
      'number.base': MESSAGES.MUST_BE_A_NUMBER,
      'number.greater': MESSAGES.MUST_BE_GREATER_THAN_ZERO
    }),
    NET_WEIGHT: Joi.number().greater(CONSTANTS.ZERO).optional().messages({
      'number.base': MESSAGES.MUST_BE_A_NUMBER,
      'number.greater': MESSAGES.MUST_BE_GREATER_THAN_ZERO
    }),
    BAILING_WIRE_PROTOCOL: Joi.string().optional().messages({
      'string.base': MESSAGES.MUST_BE_A_STRING
    }),
    HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: Joi.string()
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING
      }),
    WEIGHT_OF_NON_TARGET_MATERIALS: Joi.number()
      .greater(CONSTANTS.ZERO)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.greater': MESSAGES.MUST_BE_GREATER_THAN_ZERO
      }),
    RECYCLABLE_PROPORTION_PERCENTAGE: Joi.number()
      .greater(CONSTANTS.ZERO)
      .less(1)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.greater': MESSAGES.MUST_BE_GREATER_THAN_ZERO,
        'number.less': MESSAGES.MUST_BE_LESS_THAN_ONE
      }),
    TONNAGE_RECEIVED_FOR_RECYCLING: Joi.number().optional().messages({
      'number.base': MESSAGES.MUST_BE_A_NUMBER
    })
  })
    .unknown(true)
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * If any of these fields are missing (unfilled), the row is EXCLUDED
   * from the Waste Balance but still included in the submission.
   */
  fieldsRequiredForWasteBalance: [
    'ROW_ID',
    'DATE_RECEIVED_FOR_REPROCESSING',
    'EWC_CODE',
    'GROSS_WEIGHT',
    'TARE_WEIGHT',
    'PALLET_WEIGHT',
    'NET_WEIGHT',
    'BAILING_WIRE_PROTOCOL',
    'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
    'WEIGHT_OF_NON_TARGET_MATERIALS',
    'RECYCLABLE_PROPORTION_PERCENTAGE',
    'TONNAGE_RECEIVED_FOR_RECYCLING'
  ]
}
