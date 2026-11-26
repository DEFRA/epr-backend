/**
 * Whether a row's Previous year Row ID names a row in the previous year's
 * submission (ADR-0060).
 */
export const PREVIOUS_YEAR_LINK_STATUS = Object.freeze({
  FOUND: 'FOUND',
  NOT_FOUND: 'NOT_FOUND'
})

/** @typedef {typeof PREVIOUS_YEAR_LINK_STATUS[keyof typeof PREVIOUS_YEAR_LINK_STATUS]} PreviousYearLinkStatus */

/**
 * How a previous year's row shows its load finished, so no later row can link
 * to it. Each table that links years adds the ways its loads finish.
 */
export const PREVIOUS_YEAR_ROW_COMPLETION = Object.freeze({
  RECEIVED_BY_OSR: 'RECEIVED_BY_OSR',
  REPATRIATED: 'REPATRIATED'
})

/** @typedef {typeof PREVIOUS_YEAR_ROW_COMPLETION[keyof typeof PREVIOUS_YEAR_ROW_COMPLETION]} PreviousYearRowCompletion */

/**
 * `field` is the column the linked row's error sits on.
 *
 * @typedef {{ completion: PreviousYearRowCompletion, field: string }} PreviousYearRowCompletionAt
 */
