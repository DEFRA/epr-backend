import { MONTHLY, QUARTERLY } from '#reports/domain/cadence.js'

/**
 * Map month name to period number.
 * @type {Record<string, number>}
 * @example MONTHLY_PERIODS.January // 1
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

/** @type {Record<number, string>} */
export const MONTHLY_PERIOD_LABELS = Object.freeze(
  Object.fromEntries(
    Object.entries(MONTHLY_PERIODS).map(([name, num]) => [num, name])
  )
)

/** @type {Record<number, string>} */
export const QUARTERLY_PERIOD_LABELS = Object.freeze(
  Object.fromEntries(
    Object.entries(QUARTERLY_PERIODS).map(([name, num]) => [num, name])
  )
)

/**
 * Lookup period label by cadence and period number.
 * @type {Record<string, Record<number, string>>}
 * @example PERIOD_LABELS[MONTHLY.id][3] // 'March'
 * @example PERIOD_LABELS[QUARTERLY.id][2] // 'Q2'
 */
export const PERIOD_LABELS = Object.freeze({
  [MONTHLY.id]: MONTHLY_PERIOD_LABELS,
  [QUARTERLY.id]: QUARTERLY_PERIOD_LABELS
})
