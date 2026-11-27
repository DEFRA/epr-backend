import Joi from 'joi'
import { MESSAGES } from './joi-messages.js'
import {
  calendarDate,
  startOfDay,
  utcCalendarDate
} from '#common/helpers/date-formatter.js'
import { lastDayOfYear, utcYearOf } from '#common/helpers/dates/year.js'
import {
  isBeforeCorrectionDeadline,
  lastCorrectionDay
} from '#domain/summary-logs/correction-deadline.js'
import {
  isFutureDate,
  isFutureMonth
} from '#domain/summary-logs/future-dates.js'
import { customJoi } from '#common/validation/custom-joi.js'
import { VALIDATION_CODE } from '#common/enums/validation.js'
import { rowValidationOptionsOf } from '../validation-pipeline.js'

/** @import {Year} from '#common/helpers/dates/year.js' */
/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */
/** @import {CellMessage} from '#common/validation/validation-issue-kinds.js' */
/** @import {UploadedSummaryLog} from '#domain/summary-logs/future-dates.js' */

/**
 * @typedef {(date: CalendarDate, helpers: import('joi').CustomHelpers) => CalendarDate | import('joi').ErrorReport} DateCheck
 * @typedef {(date: CalendarDate, summaryLog: UploadedSummaryLog) => boolean} IsFuture
 */

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
export const FUTURE_DATE_ERROR = 'date.future'

/**
 * Rejects a date that `isFuture` judges to be after the summary log was
 * uploaded. Without a summary log, or with the rule switched off, the date is
 * not checked.
 *
 * @param {IsFuture} isFuture
 * @returns {DateCheck}
 */
const rejectFuture = (isFuture) => (dateStr, helpers) => {
  const options = rowValidationOptionsOf(helpers)
  return options.summaryLogYear !== undefined &&
    options.rejectsFutureDates &&
    isFuture(dateStr, options)
    ? helpers.error(FUTURE_DATE_ERROR)
    : dateStr
}

/**
 * A Joi error that carries the cell message it fills in.
 *
 * @param {import('joi').CustomHelpers} helpers
 * @param {string} type
 * @param {CellMessage} cellMessage
 * @returns {import('joi').ErrorReport}
 */
const cellMessageError = (helpers, type, cellMessage) =>
  helpers.error(type, { cellMessage })

/**
 * Rejects a YYYY-MM-DD date in a later year than the `summaryLogYear` in the
 * Joi validation context. Without one, the date is not checked.
 *
 * @param {CalendarDate} dateStr
 * @param {import('joi').CustomHelpers} helpers
 * @returns {CalendarDate | import('joi').ErrorReport}
 */
const rejectAfterSummaryLogYear = (dateStr, helpers) => {
  const { summaryLogYear } = rowValidationOptionsOf(helpers)
  return summaryLogYear !== undefined &&
    dateStr.localeCompare(lastDayOfYear(summaryLogYear)) > 0
    ? cellMessageError(helpers, AFTER_SUMMARY_LOG_YEAR_ERROR, {
        errorCode: VALIDATION_CODE.DATE_AFTER_SUMMARY_LOG_YEAR,
        expected: summaryLogYear
      })
    : dateStr
}

/**
 * Rejects a YYYY-MM-DD date in an earlier year than the `summaryLogYear` in
 * the Joi validation context while that year's correction deadline had not
 * passed at `createdAt`. Without a `summaryLogYear`, the date is not checked.
 *
 * @param {CalendarDate} dateStr
 * @param {import('joi').CustomHelpers} helpers
 * @returns {CalendarDate | import('joi').ErrorReport}
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
    ? cellMessageError(helpers, BEFORE_SUMMARY_LOG_YEAR_ERROR, {
        errorCode: VALIDATION_CODE.DATE_BEFORE_SUMMARY_LOG_YEAR,
        expected: options.summaryLogYear,
        deadline: lastCorrectionDay(dateYear, registration)
      })
    : dateStr
}

/**
 * Runs the checks in order and reports the first error, so a future date is
 * reported as future before any year rule.
 *
 * @param {DateCheck[]} checks
 * @returns {DateCheck}
 */
const firstErrorOf = (checks) => (dateStr, helpers) =>
  checks.reduce(
    (result, check) => (result === dateStr ? check(dateStr, helpers) : result),
    /** @type {CalendarDate | import('joi').ErrorReport} */ (dateStr)
  )

/**
 * @param {IsFuture} isFuture
 * @returns {DateCheck}
 */
const checkDateRules = (isFuture) =>
  firstErrorOf([
    rejectFuture(isFuture),
    rejectAfterSummaryLogYear,
    rejectOpenEarlierYear
  ])

const checkMonthRules = checkDateRules(isFutureMonth)

const DATE_RULE_MESSAGES = {
  [FUTURE_DATE_ERROR]: MESSAGES.MUST_NOT_BE_A_FUTURE_DATE,
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
 * @returns {Joi.StringSchema} Joi string schema
 */
export const createFirstOfMonthFieldSchema = () =>
  Joi.string()
    .pattern(FIRST_OF_MONTH_PATTERN)
    .custom((value, helpers) =>
      FIRST_OF_MONTH_PATTERN.test(value)
        ? checkMonthRules(calendarDate(value), helpers)
        : value
    )
    .optional()
    .messages({
      'string.base': MESSAGES.MUST_BE_A_STRING,
      'string.pattern.base': 'must be a first-of-month date (YYYY-MM-01)',
      ...DATE_RULE_MESSAGES
    })

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
const calendarDateTextOf = (value) => {
  if (value instanceof Date) {
    return utcCalendarDate(value)
  }
  if (typeof value === 'number') {
    return Number.isNaN(value) ? undefined : utcCalendarDate(new Date(value))
  }
  return typeof value === 'string'
    ? CALENDAR_DATE_PATTERN.exec(value)?.[1]
    : undefined
}

/**
 * The value as a YYYY-MM-DD calendar date from 2000-01-01 to 2100-01-01.
 *
 * @param {unknown} value
 * @returns {CalendarDate | undefined}
 */
const toCalendarDate = (value) => {
  const dateStr = calendarDateTextOf(value)
  if (dateStr === undefined) {
    return undefined
  }
  const parsed = startOfDay(dateStr)
  // A date that doesn't round-trip, such as "2024-13-01", rolled over
  const isRealDate =
    !Number.isNaN(parsed.getTime()) && utcCalendarDate(parsed) === dateStr
  return isRealDate && parsed >= DATE_MIN && parsed <= DATE_MAX
    ? calendarDate(dateStr)
    : undefined
}

/**
 * @param {unknown} value
 * @param {Year} year
 * @returns {boolean}
 */
export const isDateNoLaterThan = (value, year) => {
  const date = toCalendarDate(value)
  return date !== undefined && date.localeCompare(lastDayOfYear(year)) <= 0
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
 * @param {IsFuture} [isFuture]
 * @returns {Joi.AnySchema} Joi schema that outputs YYYY-MM-DD strings
 */
export const createDateFieldSchema = (isFuture = isFutureDate) => {
  const checkRules = checkDateRules(isFuture)
  return Joi.any()
    .custom((value, helpers) => {
      const dateStr = toCalendarDate(value)
      return dateStr === undefined
        ? helpers.error(CALENDAR_DATE_ERROR)
        : checkRules(dateStr, helpers)
    })
    .optional()
    .messages({
      [CALENDAR_DATE_ERROR]: MESSAGES.MUST_BE_A_VALID_DATE,
      ...DATE_RULE_MESSAGES
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
