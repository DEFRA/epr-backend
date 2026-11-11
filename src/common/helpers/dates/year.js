import { formatDateISO } from '#common/helpers/date-formatter.js'

/** @import {Brand} from '#common/helpers/brand.js' */
/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */

/**
 * A calendar year such as 2027. Branded so a year cannot be confused with the
 * other numbers a route handles, such as a period or a submission number.
 *
 * @typedef {Brand<number, 'Year'>} Year
 */

/**
 * @param {number} value
 * @returns {Year}
 */
export const toYear = (value) => /** @type {Year} */ (value)

const DECEMBER = 11
const LAST_DAY_OF_DECEMBER = 31

/**
 * The calendar year a date falls in, read in UTC.
 * @param {Date | string} date
 * @returns {Year}
 */
export const utcYearOf = (date) => toYear(new Date(date).getUTCFullYear())

/**
 * The current calendar year, read in UTC to match how every other
 * year-scoped boundary in this module is derived.
 * @param {Date} [now]
 * @returns {Year}
 */
export function currentUtcYear(now = new Date()) {
  return utcYearOf(now)
}

/**
 * The year after `year`.
 * @param {Year} year
 * @returns {Year}
 */
export const nextYear = (year) => toYear(year + 1)

/**
 * Every year from `first` to `last`, both included.
 * @param {Year} first
 * @param {Year} last
 * @returns {Year[]}
 */
export const yearsFromTo = (first, last) =>
  Array.from({ length: last - first + 1 }, (_, offset) =>
    toYear(first + offset)
  )

/**
 * The first and last calendar dates of a year, as `CalendarDate`s so they
 * compare lexicographically against other stored dates without conversion.
 * @param {Year} year
 * @returns {{ start: CalendarDate, end: CalendarDate }}
 */
export function yearBounds(year) {
  return {
    start: formatDateISO(year, 0, 1),
    end: formatDateISO(year, DECEMBER, LAST_DAY_OF_DECEMBER)
  }
}

/**
 * The last day of `year` when year is before `date`, else `date`, e.g.
 * - `earliestOfYearEndOrDate(2025, '2026-11-10')` // returns '2025-12-31'
 * - `earliestOfYearEndOrDate(2026, '2026-11-10')` // returns '2026-11-10'
 * - `earliestOfYearEndOrDate(2027, '2026-11-10')` // returns '2026-11-10'
 *
 * @param {Year} year
 * @param {CalendarDate} date
 * @returns {CalendarDate}
 */
export function earliestOfYearEndOrDate(year, date) {
  const { end } = yearBounds(year)
  return end.localeCompare(date) < 0 ? end : date
}
