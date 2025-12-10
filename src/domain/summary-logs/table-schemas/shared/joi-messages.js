/**
 * Common Joi validation message constants
 *
 * These messages are shared across table schemas to ensure consistent
 * error messaging for VAL010 (in-sheet validation of filled fields).
 */

export const MESSAGES = Object.freeze({
  MUST_BE_A_NUMBER: 'must be a number',
  MUST_BE_A_STRING: 'must be a string',
  MUST_BE_A_VALID_DATE: 'must be a valid date',
  MUST_BE_GREATER_THAN_ZERO: 'must be greater than 0',
  MUST_BE_AT_LEAST_ZERO: 'must be at least 0',
  MUST_BE_LESS_THAN_ONE: 'must be less than 1',
  MUST_BE_AT_MOST_ONE: 'must be at most 1',
  MUST_BE_AT_MOST_1000: 'must be at most 1000',
  MUST_BE_YES_OR_NO: 'must be Yes or No'
})

/**
 * Common regex patterns for field validation
 */
export const PATTERNS = Object.freeze({
  EWC_CODE: /^\d{2} \d{2} \d{2}\*?$/
})

/**
 * Valid string values for Yes/No fields
 */
export const YES_NO_VALUES = Object.freeze({
  YES: 'Yes',
  NO: 'No'
})

/**
 * Per-table ROW_ID minimum values
 *
 * Different tables have different ROW_ID starting offsets to ensure
 * ROW_ID values do not overlap across any table in any spreadsheet.
 */
export const ROW_ID_MINIMUMS = Object.freeze({
  RECEIVED_LOADS_FOR_REPROCESSING: 1000,
  REPROCESSED_LOADS: 3000
})
