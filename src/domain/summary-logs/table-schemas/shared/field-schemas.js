import Joi from 'joi'
import { MESSAGES } from './joi-messages.js'
import { customJoi } from '#common/validation/custom-joi.js'

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
 * IDs like OSR_ID and INTERIM_SITE_ID must be integers from 1-999.
 */
const THREE_DIGIT_ID_MIN = 1
const THREE_DIGIT_ID_MAX = 999

/**
 * Default maximum length for free text string fields
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
 * Creates a 3-digit ID field schema (1-999)
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
 * Creates a free text field schema that coerces numbers to strings.
 * Allows printable ASCII, newlines, smart punctuation, and £/€ signs.
 * ExcelJS may return numeric values for cells that look like numbers
 * (e.g. customs codes like "12345").
 *
 * @param {number} [maxLength=100] - Maximum string length
 * @returns {Joi.StringSchema} Joi string schema
 */
export const createFreeTextFieldSchema = (
  maxLength = DEFAULT_MAX_STRING_LENGTH
) =>
  customJoi
    .coercedString()
    .pattern(/^[\x20-\x7E\n\r\u2018\u2019\u201C\u201D\u2013\u2014\u2026£€]*$/)
    .max(maxLength)
    .optional()
    .messages({
      'string.base': MESSAGES.MUST_BE_A_STRING,
      'string.pattern.base': MESSAGES.MUST_CONTAIN_ONLY_PERMITTED_CHARACTERS,
      'string.max': 'must be at most {#limit} characters'
    })

/**
 * Creates an enum dropdown field schema that coerces numbers to strings.
 * ExcelJS may return numeric values if enum values look like numbers
 * (e.g. "1", "2", "3").
 *
 * @param {readonly string[]} validValues - Array of valid enum values
 * @param {string} invalidMessage - Message for invalid value
 * @returns {Joi.StringSchema} Joi string schema
 */
export const createEnumFieldSchema = (validValues, invalidMessage) =>
  customJoi
    .coercedString()
    .valid(...validValues)
    .optional()
    .messages({
      'string.base': MESSAGES.MUST_BE_A_STRING,
      'any.only': invalidMessage
    })
