import Joi from 'joi'
import { MESSAGES, PATTERNS, ROW_ID_MINIMUMS } from '../shared/index.js'
import { createRowIdSchema } from '../shared/row-id.schema.js'
import { RECEIVED_LOADS_FIELDS as FIELDS } from './fields.js'
import {
  NET_WEIGHT_MESSAGES,
  validateNetWeight
} from './validators/net-weight-validator.js'

/**
 * Maximum values for weight fields (in tonnes)
 *
 * Defined locally as these limits are specific to this table and may
 * differ from similar fields in other tables.
 */
const MAX_GROSS_WEIGHT = 1000
const MAX_TARE_WEIGHT = 1000
const MAX_PALLET_WEIGHT = 1000
const MAX_NET_WEIGHT = 1000
const MAX_WEIGHT_OF_NON_TARGET_MATERIALS = 1000

/**
 * Table schema for RECEIVED_LOADS_FOR_REPROCESSING
 *
 * Tracks waste received for reprocessing. This schema defines:
 * - What counts as "unfilled" per field (unfilledValues)
 * - How to validate filled fields (validationSchema for VAL010)
 * - Which fields must be present for Waste Balance (fieldsRequiredForWasteBalance for VAL011)
 */
export const RECEIVED_LOADS_FOR_REPROCESSING = {
  rowIdField: FIELDS.ROW_ID,

  requiredHeaders: [
    FIELDS.ROW_ID,
    FIELDS.DATE_RECEIVED_FOR_REPROCESSING,
    FIELDS.EWC_CODE,
    FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE,
    FIELDS.GROSS_WEIGHT,
    FIELDS.TARE_WEIGHT,
    FIELDS.PALLET_WEIGHT,
    FIELDS.NET_WEIGHT,
    FIELDS.BAILING_WIRE_PROTOCOL,
    FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION,
    FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS,
    FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE,
    FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING
  ],

  /**
   * Per-field values that indicate "unfilled"
   *
   * Fields not listed use the default empty check (null, undefined, '').
   * Listed fields additionally treat these specific values as unfilled,
   * typically dropdown placeholder values from the Excel template.
   */
  unfilledValues: {
    [FIELDS.BAILING_WIRE_PROTOCOL]: ['Choose option'],
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: ['Choose option']
  },

  /**
   * Fields that produce FATAL errors when validation fails
   *
   * ROW_ID is always fatal as it indicates tampering or corruption.
   * Additional fields are fatal per ticket requirements.
   */
  fatalFields: [
    FIELDS.ROW_ID,
    FIELDS.DATE_RECEIVED_FOR_REPROCESSING,
    FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE,
    FIELDS.GROSS_WEIGHT,
    FIELDS.TARE_WEIGHT,
    FIELDS.PALLET_WEIGHT,
    FIELDS.NET_WEIGHT,
    FIELDS.BAILING_WIRE_PROTOCOL,
    FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS,
    FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE
  ],

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   * Any failure here results in REJECTED (blocks entire submission).
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.RECEIVED_LOADS_FOR_REPROCESSING
    ).optional(),
    [FIELDS.DATE_RECEIVED_FOR_REPROCESSING]: Joi.date().optional().messages({
      'date.base': MESSAGES.MUST_BE_A_VALID_DATE
    }),
    [FIELDS.EWC_CODE]: Joi.string()
      .pattern(PATTERNS.EWC_CODE)
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'string.pattern.base':
          'must be in format "XX XX XX" with optional * suffix (e.g. "03 03 08" or "03 03 08*")'
      }),
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: Joi.string()
      .valid('Yes', 'No')
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'any.only': MESSAGES.MUST_BE_YES_OR_NO
      }),
    [FIELDS.GROSS_WEIGHT]: Joi.number()
      .min(0)
      .max(MAX_GROSS_WEIGHT)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1000
      }),
    [FIELDS.TARE_WEIGHT]: Joi.number()
      .min(0)
      .max(MAX_TARE_WEIGHT)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1000
      }),
    [FIELDS.PALLET_WEIGHT]: Joi.number()
      .min(0)
      .max(MAX_PALLET_WEIGHT)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1000
      }),
    [FIELDS.NET_WEIGHT]: Joi.number()
      .min(0)
      .max(MAX_NET_WEIGHT)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1000
      }),
    [FIELDS.BAILING_WIRE_PROTOCOL]: Joi.string()
      .valid('Yes', 'No')
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'any.only': MESSAGES.MUST_BE_YES_OR_NO
      }),
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: Joi.string()
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING
      }),
    [FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS]: Joi.number()
      .min(0)
      .max(MAX_WEIGHT_OF_NON_TARGET_MATERIALS)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1000
      }),
    [FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE]: Joi.number()
      .min(0)
      .max(1)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1
      }),
    [FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING]: Joi.number().optional().messages({
      'number.base': MESSAGES.MUST_BE_A_NUMBER
    })
  })
    .custom(validateNetWeight)
    .unknown(true)
    .messages(NET_WEIGHT_MESSAGES)
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * If any of these fields are missing (unfilled), the row is EXCLUDED
   * from the Waste Balance but still included in the submission.
   *
   * Note: EWC_CODE, HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION, and
   * TONNAGE_RECEIVED_FOR_RECYCLING are excluded as they require lookup
   * tables or complex formula validation not yet implemented.
   */
  fieldsRequiredForWasteBalance: [
    FIELDS.ROW_ID,
    FIELDS.DATE_RECEIVED_FOR_REPROCESSING,
    FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE,
    FIELDS.GROSS_WEIGHT,
    FIELDS.TARE_WEIGHT,
    FIELDS.PALLET_WEIGHT,
    FIELDS.NET_WEIGHT,
    FIELDS.BAILING_WIRE_PROTOCOL,
    FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS,
    FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE
  ]
}
