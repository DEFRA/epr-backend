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
  MUST_BE_AT_MOST_1: 'must be at most 1',
  MUST_BE_LESS_THAN_ONE: 'must be less than 1',
  MUST_BE_AT_MOST_1000: 'must be at most 1000',
  MUST_BE_AT_MOST_100_CHARS: 'must be at most 100 characters',
  MUST_BE_YES_OR_NO: 'must be Yes or No',
  MUST_BE_ALPHANUMERIC: 'must be alphanumeric',
  MUST_BE_3_DIGIT_NUMBER: 'must be a number between 1 and 999',
  MUST_BE_VALID_EWC_CODE: 'must be a valid EWC code from the allowed list',
  MUST_BE_VALID_RECYCLABLE_PROPORTION_METHOD:
    'must be a valid recyclable proportion calculation method',
  MUST_BE_VALID_WASTE_DESCRIPTION:
    'must be a valid waste description from the allowed list',
  MUST_BE_VALID_BASEL_CODE:
    'must be a valid Basel export code from the allowed list',
  MUST_BE_VALID_EXPORT_CONTROL:
    'must be a valid export control type from the allowed list'
})

/**
 * Valid string values for Yes/No fields
 */
export const YES_NO_VALUES = Object.freeze({
  YES: 'Yes',
  NO: 'No'
})

/**
 * Default placeholder value for dropdown fields in Excel templates
 *
 * Used in unfilledValues to treat this value as "not filled".
 */
export const DROPDOWN_PLACEHOLDER = Object.freeze(['Choose option'])
