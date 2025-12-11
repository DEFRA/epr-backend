import Joi from 'joi'
import {
  MESSAGES,
  EWC_CODES,
  RECYCLABLE_PROPORTION_METHODS,
  WASTE_DESCRIPTIONS,
  BASEL_CODES,
  EXPORT_CONTROLS,
  createRowIdSchema
} from '../shared/index.js'
import { RECEIVED_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import {
  NET_WEIGHT_MESSAGES,
  validateNetWeight
} from './validators/net-weight-validator.js'
import {
  TONNAGE_EXPORT_MESSAGES,
  validateTonnageExport
} from './validators/tonnage-export-validator.js'

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
const MAX_TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED = 1000
const MAX_TONNAGE_PASSED_INTERIM_SITE = 1000

/**
 * 3-digit ID constraints (100-999)
 */
const MIN_THREE_DIGIT_ID = 100
const MAX_THREE_DIGIT_ID = 999

/**
 * Maximum length for alphanumeric string fields
 */
const MAX_ALPHANUMERIC_LENGTH = 100

/**
 * Regex pattern for alphanumeric validation
 */
const ALPHANUMERIC_PATTERN = /^[a-zA-Z0-9]+$/

/**
 * Table schema for RECEIVED_LOADS_FOR_EXPORT
 *
 * Tracks waste received for export. This schema defines:
 * - What counts as "unfilled" per field (unfilledValues)
 * - How to validate filled fields (validationSchema for VAL010)
 * - Which fields must be present for Waste Balance (fieldsRequiredForWasteBalance for VAL011)
 */
export const RECEIVED_LOADS_FOR_EXPORT = {
  rowIdField: FIELDS.ROW_ID,

  requiredHeaders: [
    FIELDS.ROW_ID,
    FIELDS.DATE_RECEIVED_FOR_EXPORT,
    FIELDS.EWC_CODE,
    FIELDS.DESCRIPTION_WASTE,
    FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE,
    FIELDS.GROSS_WEIGHT,
    FIELDS.TARE_WEIGHT,
    FIELDS.PALLET_WEIGHT,
    FIELDS.NET_WEIGHT,
    FIELDS.BAILING_WIRE_PROTOCOL,
    FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION,
    FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS,
    FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE,
    FIELDS.TONNAGE_RECEIVED_FOR_EXPORT,
    FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED,
    FIELDS.DATE_OF_EXPORT,
    FIELDS.BASEL_EXPORT_CODE,
    FIELDS.CUSTOMS_CODES,
    FIELDS.CONTAINER_NUMBER,
    FIELDS.DATE_RECEIVED_BY_OSR,
    FIELDS.OSR_ID,
    FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE,
    FIELDS.INTERIM_SITE_ID,
    FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR,
    FIELDS.EXPORT_CONTROLS
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
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: ['Choose option'],
    [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: ['Choose option'],
    [FIELDS.EXPORT_CONTROLS]: ['Choose option']
  },

  /**
   * Fields that produce FATAL errors when validation fails
   *
   * ROW_ID is always fatal as it indicates tampering or corruption.
   * All fields are fatal per ticket requirements.
   */
  fatalFields: [
    FIELDS.ROW_ID,
    FIELDS.DATE_RECEIVED_FOR_EXPORT,
    FIELDS.EWC_CODE,
    FIELDS.DESCRIPTION_WASTE,
    FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE,
    FIELDS.GROSS_WEIGHT,
    FIELDS.TARE_WEIGHT,
    FIELDS.PALLET_WEIGHT,
    FIELDS.NET_WEIGHT,
    FIELDS.BAILING_WIRE_PROTOCOL,
    FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION,
    FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS,
    FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE,
    FIELDS.TONNAGE_RECEIVED_FOR_EXPORT,
    FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED,
    FIELDS.DATE_OF_EXPORT,
    FIELDS.BASEL_EXPORT_CODE,
    FIELDS.CUSTOMS_CODES,
    FIELDS.CONTAINER_NUMBER,
    FIELDS.DATE_RECEIVED_BY_OSR,
    FIELDS.OSR_ID,
    FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE,
    FIELDS.INTERIM_SITE_ID,
    FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR,
    FIELDS.EXPORT_CONTROLS
  ],

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   * Any failure here results in REJECTED (blocks entire submission).
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.RECEIVED_LOADS_FOR_EXPORT
    ).optional(),
    [FIELDS.DATE_RECEIVED_FOR_EXPORT]: Joi.date().optional().messages({
      'date.base': MESSAGES.MUST_BE_A_VALID_DATE
    }),
    [FIELDS.EWC_CODE]: Joi.string()
      .valid(...EWC_CODES)
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'any.only': MESSAGES.MUST_BE_VALID_EWC_CODE
      }),
    [FIELDS.DESCRIPTION_WASTE]: Joi.string()
      .valid(...WASTE_DESCRIPTIONS)
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'any.only': MESSAGES.MUST_BE_VALID_WASTE_DESCRIPTION
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
      .valid(...RECYCLABLE_PROPORTION_METHODS)
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'any.only': MESSAGES.MUST_BE_VALID_RECYCLABLE_PROPORTION_METHOD
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
    [FIELDS.TONNAGE_RECEIVED_FOR_EXPORT]: Joi.number().optional().messages({
      'number.base': MESSAGES.MUST_BE_A_NUMBER
    }),
    [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: Joi.number()
      .min(0)
      .max(MAX_TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1000
      }),
    [FIELDS.DATE_OF_EXPORT]: Joi.date().optional().messages({
      'date.base': MESSAGES.MUST_BE_A_VALID_DATE
    }),
    [FIELDS.BASEL_EXPORT_CODE]: Joi.string()
      .valid(...BASEL_CODES)
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'any.only': MESSAGES.MUST_BE_VALID_BASEL_CODE
      }),
    [FIELDS.CUSTOMS_CODES]: Joi.string()
      .pattern(ALPHANUMERIC_PATTERN)
      .max(MAX_ALPHANUMERIC_LENGTH)
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'string.pattern.base': MESSAGES.MUST_BE_ALPHANUMERIC,
        'string.max': MESSAGES.MUST_BE_AT_MOST_100_CHARS
      }),
    [FIELDS.CONTAINER_NUMBER]: Joi.string()
      .pattern(ALPHANUMERIC_PATTERN)
      .max(MAX_ALPHANUMERIC_LENGTH)
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'string.pattern.base': MESSAGES.MUST_BE_ALPHANUMERIC,
        'string.max': MESSAGES.MUST_BE_AT_MOST_100_CHARS
      }),
    [FIELDS.DATE_RECEIVED_BY_OSR]: Joi.date().optional().messages({
      'date.base': MESSAGES.MUST_BE_A_VALID_DATE
    }),
    [FIELDS.OSR_ID]: Joi.number()
      .integer()
      .min(MIN_THREE_DIGIT_ID)
      .max(MAX_THREE_DIGIT_ID)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.integer': MESSAGES.MUST_BE_3_DIGIT_NUMBER,
        'number.min': MESSAGES.MUST_BE_3_DIGIT_NUMBER,
        'number.max': MESSAGES.MUST_BE_3_DIGIT_NUMBER
      }),
    [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: Joi.string()
      .valid('Yes', 'No')
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'any.only': MESSAGES.MUST_BE_YES_OR_NO
      }),
    [FIELDS.INTERIM_SITE_ID]: Joi.number()
      .integer()
      .min(MIN_THREE_DIGIT_ID)
      .max(MAX_THREE_DIGIT_ID)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.integer': MESSAGES.MUST_BE_3_DIGIT_NUMBER,
        'number.min': MESSAGES.MUST_BE_3_DIGIT_NUMBER,
        'number.max': MESSAGES.MUST_BE_3_DIGIT_NUMBER
      }),
    [FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]: Joi.number()
      .min(0)
      .max(MAX_TONNAGE_PASSED_INTERIM_SITE)
      .optional()
      .messages({
        'number.base': MESSAGES.MUST_BE_A_NUMBER,
        'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
        'number.max': MESSAGES.MUST_BE_AT_MOST_1000
      }),
    [FIELDS.EXPORT_CONTROLS]: Joi.string()
      .valid(...EXPORT_CONTROLS)
      .optional()
      .messages({
        'string.base': MESSAGES.MUST_BE_A_STRING,
        'any.only': MESSAGES.MUST_BE_VALID_EXPORT_CONTROL
      })
  })
    .custom(validateNetWeight)
    .custom(validateTonnageExport)
    .unknown(true)
    .messages({
      ...NET_WEIGHT_MESSAGES,
      ...TONNAGE_EXPORT_MESSAGES
    })
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * If any of these fields are missing (unfilled), the row is EXCLUDED
   * from the Waste Balance but still included in the submission.
   */
  fieldsRequiredForWasteBalance: [
    FIELDS.ROW_ID,
    FIELDS.DATE_RECEIVED_FOR_EXPORT,
    FIELDS.EWC_CODE,
    FIELDS.DESCRIPTION_WASTE,
    FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE,
    FIELDS.GROSS_WEIGHT,
    FIELDS.TARE_WEIGHT,
    FIELDS.PALLET_WEIGHT,
    FIELDS.NET_WEIGHT,
    FIELDS.BAILING_WIRE_PROTOCOL,
    FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION,
    FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS,
    FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE,
    FIELDS.TONNAGE_RECEIVED_FOR_EXPORT
  ]
}
