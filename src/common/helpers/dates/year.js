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
 * The year before `year`.
 * @param {Year} year
 * @returns {Year}
 */
export const previousYear = (year) => toYear(year - 1)

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
 * @param {Year} year
 * @returns {CalendarDate} last calendar date of the year
 */
export function lastDayOfYear(year) {
  return yearBounds(year).end
}
