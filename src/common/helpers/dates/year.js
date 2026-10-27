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
 * The last day of `year`, or `today` while the year is still running.
 * @param {Year} year
 * @param {CalendarDate} today
 * @returns {CalendarDate}
 */
export function yearEndOrToday(year, today) {
  const { end } = yearBounds(year)
  return end.localeCompare(today) < 0 ? end : today
}

/**
 * Whether `year` is later than the current calendar year — a year that
 * hasn't started yet, so nothing can be valid for it.
 * @param {Year} year
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isFutureYear(year, now = new Date()) {
  return year > currentUtcYear(now)
}
