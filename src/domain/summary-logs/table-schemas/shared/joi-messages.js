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
  MUST_BE_LESS_THAN_ONE: 'must be less than 1',
  MUST_BE_AT_LEAST_10000: 'must be at least 10000'
})

/**
 * Common regex patterns for field validation
 */
export const PATTERNS = Object.freeze({
  EWC_CODE: /^\d{2} \d{2} \d{2}\*?$/
})

/**
 * Common numeric constants for validation
 */
export const CONSTANTS = Object.freeze({
  MIN_ROW_ID: 10000,
  ZERO: 0
})
