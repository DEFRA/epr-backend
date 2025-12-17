import Joi from 'joi'
import { MESSAGES } from './joi-messages.js'

/**
 * Common field schema factories for table validation
 *
 * These factories create reusable Joi field schemas for common field types
 * found across multiple table schemas.
 */

/**
 * Default maximum weight in tonnes
 */
const DEFAULT_MAX_WEIGHT = 1000

/**
 * 3-digit ID constraints
 *
 * IDs like OSR_ID and INTERIM_SITE_ID must be integers from 100-999.
 */
const THREE_DIGIT_ID_MIN = 100
const THREE_DIGIT_ID_MAX = 999

/**
 * Default maximum length for alphanumeric string fields
 */
const DEFAULT_MAX_STRING_LENGTH = 100

/**
 * Creates a weight field schema (number, min 0, configurable max)
 *
 * @param {number} [max=1000] - Maximum weight value
 * @param {string} [maxMessage=MESSAGES.MUST_BE_AT_MOST_1000] - Error message for max constraint
 * @returns {Joi.NumberSchema} Joi number schema
 */
export const createWeightFieldSchema = (
  max = DEFAULT_MAX_WEIGHT,
  maxMessage = MESSAGES.MUST_BE_AT_MOST_1000
) =>
  Joi.number().min(0).max(max).optional().messages({
    'number.base': MESSAGES.MUST_BE_A_NUMBER,
    'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
    'number.max': maxMessage
  })

/**
 * Creates a Yes/No dropdown field schema
 *
 * @returns {Joi.StringSchema} Joi string schema
 */
export const createYesNoFieldSchema = () =>
  Joi.string().valid('Yes', 'No').optional().messages({
    'string.base': MESSAGES.MUST_BE_A_STRING,
    'any.only': MESSAGES.MUST_BE_YES_OR_NO
  })

/**
 * Creates a date field schema
 *
 * @returns {Joi.DateSchema} Joi date schema
 */
export const createDateFieldSchema = () =>
  Joi.date().optional().messages({
    'date.base': MESSAGES.MUST_BE_A_VALID_DATE
  })

/**
 * Creates a 3-digit ID field schema (100-999)
 *
 * @returns {Joi.NumberSchema} Joi number schema
 */
export const createThreeDigitIdSchema = () =>
  Joi.number()
    .integer()
    .min(THREE_DIGIT_ID_MIN)
    .max(THREE_DIGIT_ID_MAX)
    .optional()
    .messages({
      'number.base': MESSAGES.MUST_BE_A_NUMBER,
      'number.integer': MESSAGES.MUST_BE_3_DIGIT_NUMBER,
      'number.min': MESSAGES.MUST_BE_3_DIGIT_NUMBER,
      'number.max': MESSAGES.MUST_BE_3_DIGIT_NUMBER
    })

/**
 * Creates a percentage field schema (0-1)
 *
 * @returns {Joi.NumberSchema} Joi number schema
 */
export const createPercentageFieldSchema = () =>
  Joi.number().min(0).max(1).optional().messages({
    'number.base': MESSAGES.MUST_BE_A_NUMBER,
    'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO,
    'number.max': MESSAGES.MUST_BE_AT_MOST_1
  })

/**
 * Creates an alphanumeric string field schema
 *
 * @param {number} [maxLength=100] - Maximum string length
 * @returns {Joi.StringSchema} Joi string schema
 */
export const createAlphanumericFieldSchema = (
  maxLength = DEFAULT_MAX_STRING_LENGTH
) =>
  Joi.string()
    .pattern(/^[a-zA-Z0-9]+$/)
    .max(maxLength)
    .optional()
    .messages({
      'string.base': MESSAGES.MUST_BE_A_STRING,
      'string.pattern.base': MESSAGES.MUST_BE_ALPHANUMERIC,
      'string.max': MESSAGES.MUST_BE_AT_MOST_100_CHARS
    })

/**
 * Creates an enum dropdown field schema
 *
 * @param {readonly string[]} validValues - Array of valid enum values
 * @param {string} invalidMessage - Message for invalid value
 * @returns {Joi.StringSchema} Joi string schema
 */
export const createEnumFieldSchema = (validValues, invalidMessage) =>
  Joi.string()
    .valid(...validValues)
    .optional()
    .messages({
      'string.base': MESSAGES.MUST_BE_A_STRING,
      'any.only': invalidMessage
    })

/**
 * Creates a simple number field schema (no range constraints)
 *
 * @returns {Joi.NumberSchema} Joi number schema
 */
export const createNumberFieldSchema = () =>
  Joi.number().optional().messages({
    'number.base': MESSAGES.MUST_BE_A_NUMBER
  })
