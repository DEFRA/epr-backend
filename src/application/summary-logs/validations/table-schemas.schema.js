import Joi from 'joi'

/**
 * Constants for SONAR...
 */
const EWC_CODE_REGEX = /^\d{2} \d{2} \d{2}$/
const HOW_CALCULATE_RECYCLABLE_REGEX = /^[A-Z]+$/
const MIN_OUR_REFERENCE = 10000
const ZERO = 0

const IS_REQUIRED = 'is required'
const MUST_BE_A_VALID_DATE = 'must be a valid date'
const MUST_BE_A_BOOLEAN = 'must be a boolean'
const MUST_BE_A_NUMBER = 'must be a number'
const MUST_BE_A_STRING = 'must be a string'
const MUST_BE_GREATER_THAN_ZERO = 'must be greater than 0'
const MUST_BE_LESS_THAN_ONE = 'must be less than 1'
const MUST_ONLY_CONTAIN_UPPERCASE_LETTERS =
  'must contain only uppercase letters'

/**
 * Joi schema for UPDATE_WASTE_BALANCE table columns
 * This table tracks waste received for reprocessing
 */
export const UPDATE_WASTE_BALANCE_SCHEMA = {
  OUR_REFERENCE: Joi.number().required().min(MIN_OUR_REFERENCE).messages({
    'number.base': MUST_BE_A_NUMBER,
    'number.min': 'must be at least 10000',
    'any.required': IS_REQUIRED
  }),
  DATE_RECEIVED: Joi.date().required().messages({
    'date.base': MUST_BE_A_VALID_DATE,
    'any.required': IS_REQUIRED
  }),
  EWC_CODE: Joi.string().required().pattern(EWC_CODE_REGEX).messages({
    'string.base': MUST_BE_A_STRING,
    'string.pattern.base': 'must be in format "XX XX XX" (e.g., "03 03 08")',
    'any.required': IS_REQUIRED
  }),
  GROSS_WEIGHT: Joi.number().required().greater(ZERO).messages({
    'number.base': MUST_BE_A_NUMBER,
    'number.greater': MUST_BE_GREATER_THAN_ZERO,
    'any.required': IS_REQUIRED
  }),
  TARE_WEIGHT: Joi.number().required().greater(ZERO).messages({
    'number.base': MUST_BE_A_NUMBER,
    'number.greater': MUST_BE_GREATER_THAN_ZERO,
    'any.required': IS_REQUIRED
  }),
  PALLET_WEIGHT: Joi.number().required().greater(ZERO).messages({
    'number.base': MUST_BE_A_NUMBER,
    'number.greater': MUST_BE_GREATER_THAN_ZERO,
    'any.required': IS_REQUIRED
  }),
  NET_WEIGHT: Joi.number().required().greater(ZERO).messages({
    'number.base': MUST_BE_A_NUMBER,
    'number.greater': MUST_BE_GREATER_THAN_ZERO,
    'any.required': IS_REQUIRED
  }),
  BAILING_WIRE: Joi.boolean().required().messages({
    'boolean.base': MUST_BE_A_BOOLEAN,
    'any.required': IS_REQUIRED
  }),
  HOW_CALCULATE_RECYCLABLE: Joi.string()
    .required()
    .pattern(HOW_CALCULATE_RECYCLABLE_REGEX)
    .messages({
      'string.base': MUST_BE_A_STRING,
      'string.pattern.base': MUST_ONLY_CONTAIN_UPPERCASE_LETTERS,
      'any.required': IS_REQUIRED
    }),
  WEIGHT_OF_NON_TARGET: Joi.number().required().greater(ZERO).messages({
    'number.base': MUST_BE_A_NUMBER,
    'number.greater': MUST_BE_GREATER_THAN_ZERO,
    'any.required': IS_REQUIRED
  }),
  RECYCLABLE_PROPORTION: Joi.number()
    .required()
    .greater(ZERO)
    .less(1)
    .messages({
      'number.base': MUST_BE_A_NUMBER,
      'number.greater': MUST_BE_GREATER_THAN_ZERO,
      'number.less': MUST_BE_LESS_THAN_ONE,
      'any.required': IS_REQUIRED
    }),
  TONNAGE_RECEIVED_FOR_EXPORT: Joi.number().required().messages({
    'number.base': MUST_BE_A_NUMBER,
    'any.required': IS_REQUIRED
  })
}
