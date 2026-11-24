import Joi from 'joi'
import { MESSAGES } from './joi-messages.js'
import { startOfDay, utcCalendarDate } from '#common/helpers/date-formatter.js'
import { lastDayOfYear, utcYearOf } from '#common/helpers/dates/year.js'
import {
  isBeforeCorrectionDeadline,
  lastCorrectionDay
} from '#domain/summary-logs/correction-deadline.js'
import { customJoi } from '#common/validation/custom-joi.js'
import { rowValidationOptionsOf } from '../validation-pipeline.js'

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
 * Valid date range for operational load/export records.
 * Guards against Excel epoch dates (1900-01-01) and clearly out-of-range values.
 */
const DATE_MIN = new Date('2000-01-01')
const DATE_MAX = new Date('2100-01-01')
const CALENDAR_DATE_ERROR = 'any.calendarDate'
const CALENDAR_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})/
const FIRST_OF_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-01$/
export const AFTER_SUMMARY_LOG_YEAR_ERROR = 'date.afterSummaryLogYear'
export const BEFORE_SUMMARY_LOG_YEAR_ERROR = 'date.beforeSummaryLogYear'

/**
 * @typedef {{ rejectOpenEarlierYear?: boolean }} DateFieldOptions
 * `rejectOpenEarlierYear` rejects a date in an earlier year whose correction
 * deadline had not passed when the summary log was created: it belongs in
 * that year's log.
 */

/**
 * Rejects a YYYY-MM-DD date in a later year than the `summaryLogYear` in the
 * Joi validation context. Without one, the date is not checked.
 *
 * @param {string} dateStr
 * @param {import('joi').CustomHelpers} helpers
 * @returns {string | import('joi').ErrorReport}
 */
const rejectAfterSummaryLogYear = (dateStr, helpers) => {
  const { summaryLogYear } = rowValidationOptionsOf(helpers)
  return summaryLogYear !== undefined && dateStr > lastDayOfYear(summaryLogYear)
    ? helpers.error(AFTER_SUMMARY_LOG_YEAR_ERROR, { expected: summaryLogYear })
    : dateStr
}

/**
 * Rejects a YYYY-MM-DD date in an earlier year than the `summaryLogYear` in
 * the Joi validation context while that year's correction deadline had not
 * passed at `createdAt`. Without a `summaryLogYear`, the date is not checked.
 *
 * @param {string} dateStr
 * @param {import('joi').CustomHelpers} helpers
 * @returns {string | import('joi').ErrorReport}
 */
const rejectOpenEarlierYear = (dateStr, helpers) => {
  const options = rowValidationOptionsOf(helpers)
  // A filled-in row's dates came from the previous year; the cross-year rules
  // check the ones it supplied.
  if (options.summaryLogYear === undefined || options.filledIn) {
    return dateStr
  }
  const dateYear = utcYearOf(dateStr)
  const registration = { registeredOnly: options.registeredOnly }
  return dateYear < options.summaryLogYear &&
    isBeforeCorrectionDeadline(dateYear, registration, options.createdAt)
    ? helpers.error(BEFORE_SUMMARY_LOG_YEAR_ERROR, {
        expected: options.summaryLogYear,
        deadline: lastCorrectionDay(dateYear, registration)
      })
    : dateStr
}

/**
 * @param {DateFieldOptions} options
 * @returns {(dateStr: string, helpers: import('joi').CustomHelpers) => string | import('joi').ErrorReport}
 */
const checkAgainstSummaryLogYear =
  ({ rejectOpenEarlierYear: rejectEarlier = false }) =>
  (dateStr, helpers) => {
    const after = rejectAfterSummaryLogYear(dateStr, helpers)
    return after === dateStr && rejectEarlier
      ? rejectOpenEarlierYear(dateStr, helpers)
      : after
  }

const SUMMARY_LOG_YEAR_MESSAGES = {
  [AFTER_SUMMARY_LOG_YEAR_ERROR]: MESSAGES.MUST_NOT_BE_AFTER_SUMMARY_LOG_YEAR,
  [BEFORE_SUMMARY_LOG_YEAR_ERROR]:
    MESSAGES.MUST_NOT_BE_IN_OPEN_EARLIER_SUMMARY_LOG_YEAR
}

/**
 * 3-digit ID constraints
 *
 * IDs like OSR_ID and INTERIM_SITE_ID must be integers from 1-999,
 * zero-padded to 3 characters (e.g. 99 → "099").
 */
const THREE_DIGIT_ID_MIN = 1
const THREE_DIGIT_ID_MAX = 999
const THREE_DIGIT_PAD = 3

/**
 * Zero-pads a numeric or string value to a 3-digit string.
 * Used both by the Joi schema and by lookup code that receives
 * raw Excel values (numbers) that need to match registration keys.
 *
 * @param {number | string} value
 * @returns {string} Zero-padded 3-digit string (e.g. 99 → "099")
 */
export const toThreeDigitId = (value) =>
  String(Number(value)).padStart(THREE_DIGIT_PAD, '0')

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
 * Creates an unbounded weight field schema (number, min 0, no upper limit)
 *
 * Used for V2.1+ registered-only templates where the 1000-tonne cap was removed.
 *
 * @returns {Joi.NumberSchema} Joi number schema
 */
export const createUnboundedWeightFieldSchema = () =>
  Joi.number().min(0).optional().messages({
    'number.base': MESSAGES.MUST_BE_A_NUMBER,
    'number.min': MESSAGES.MUST_BE_AT_LEAST_ZERO
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
 * Creates a first-of-month date string schema (YYYY-MM-01)
 *
 * Used for registered-only templates where monthly granularity replaces daily dates.
 * Excel stores the dropdown value as a first-of-month date string.
 *
 * @param {DateFieldOptions} [options]
 * @returns {Joi.StringSchema} Joi string schema
 */
export const createFirstOfMonthFieldSchema = (options = {}) => {
  const check = checkAgainstSummaryLogYear(options)
  return Joi.string()
    .pattern(FIRST_OF_MONTH_PATTERN)
    .custom((value, helpers) =>
      FIRST_OF_MONTH_PATTERN.test(value) ? check(value, helpers) : value
    )
    .optional()
    .messages({
      'string.base': MESSAGES.MUST_BE_A_STRING,
      'string.pattern.base': 'must be a first-of-month date (YYYY-MM-01)',
      ...SUMMARY_LOG_YEAR_MESSAGES
    })
}

/**
 * Creates a calendar date field schema (2000-01-01 to 2100-01-01).
 *
 * Validates the date range but keeps the value as a YYYY-MM-DD string
 * rather than coercing to a JavaScript Date object. This system only
 * uses calendar dates, not timestamps.
 *
 * Accepts YYYY-MM-DD strings and Date objects (coerced to YYYY-MM-DD).
 *
 * @param {DateFieldOptions} [options]
 * @returns {Joi.AnySchema} Joi schema that outputs YYYY-MM-DD strings
 */
export const createDateFieldSchema = (options = {}) => {
  const check = checkAgainstSummaryLogYear(options)
  return Joi.any()
    .custom((value, helpers) => {
      let dateStr
      if (value instanceof Date) {
        dateStr = utcCalendarDate(value)
      } else if (typeof value === 'number') {
        if (Number.isNaN(value)) {
          return helpers.error(CALENDAR_DATE_ERROR)
        }
        dateStr = utcCalendarDate(new Date(value))
      } else if (typeof value === 'string') {
        const match = CALENDAR_DATE_PATTERN.exec(value)
        if (!match) {
          return helpers.error(CALENDAR_DATE_ERROR)
        }
        dateStr = match[1]
      } else {
        return helpers.error(CALENDAR_DATE_ERROR)
      }

      const parsed = startOfDay(dateStr)

      // Reject if the parsed date doesn't round-trip to the same string
      // (catches values like "2024-13-01" that Date silently rolls over)
      if (
        Number.isNaN(parsed.getTime()) ||
        utcCalendarDate(parsed) !== dateStr
      ) {
        return helpers.error(CALENDAR_DATE_ERROR)
      }

      if (parsed < DATE_MIN || parsed > DATE_MAX) {
        return helpers.error(CALENDAR_DATE_ERROR)
      }

      return check(dateStr, helpers)
    })
    .optional()
    .messages({
      [CALENDAR_DATE_ERROR]: MESSAGES.MUST_BE_A_VALID_DATE,
      ...SUMMARY_LOG_YEAR_MESSAGES
    })
}

/**
 * Creates a 3-digit ID field schema that coerces numbers to zero-padded
 * strings (e.g. 99 → "099"). Excel stores these as numbers, but the
 * registration schema uses 3-digit string keys like "099".
 *
 * @returns {Joi.StringSchema} Joi string schema
 */
export const createThreeDigitIdSchema = () =>
  customJoi
    .coercedString()
    .custom((value, helpers) => {
      const num = Number(value)
      if (
        !Number.isInteger(num) ||
        num < THREE_DIGIT_ID_MIN ||
        num > THREE_DIGIT_ID_MAX
      ) {
        return helpers.error('string.threeDigitId')
      }
      return toThreeDigitId(num)
    })
    .optional()
    .messages({
      'string.threeDigitId': MESSAGES.MUST_BE_3_DIGIT_ID
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
 * Allows printable ASCII, newlines, non-breaking spaces, soft hyphens,
 * smart punctuation, and £/€ signs.
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
    .pattern(
      /^[\x20-\x7E\n\r\u00A0\u00AD\u2018\u2019\u201C\u201D\u2013\u2014\u2026£€]*$/
    )
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
    .trim()
    .valid(...validValues)
    .optional()
    .messages({
      'string.base': MESSAGES.MUST_BE_A_STRING,
      'any.only': invalidMessage
    })
