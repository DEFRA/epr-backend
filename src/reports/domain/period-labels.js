/**
 * Map month name to period number.
 * @type {Record<string, number>}
 */
export const MONTHLY_PERIODS = Object.freeze({
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12
})

/**
 * Map quarter name to period number.
 * @type {Record<string, number>}
 * @example QUARTERLY_PERIODS.Q1 // 1
 */
export const QUARTERLY_PERIODS = Object.freeze({
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4
})
