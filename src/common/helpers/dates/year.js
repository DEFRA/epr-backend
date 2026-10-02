import { formatDateISO } from '#common/helpers/date-formatter.js'

/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */

const DECEMBER = 11
const LAST_DAY_OF_DECEMBER = 31

/**
 * The current calendar year, read in UTC to match how every other
 * year-scoped boundary in this module is derived.
 * @param {Date} [now]
 * @returns {number}
 */
export function currentUtcYear(now = new Date()) {
  return now.getUTCFullYear()
}

/**
 * The first and last calendar dates of a year, as `CalendarDate`s so they
 * compare lexicographically against other stored dates without conversion.
 * @param {number} year
 * @returns {{ start: CalendarDate, end: CalendarDate }}
 */
export function yearBounds(year) {
  return {
    start: formatDateISO(year, 0, 1),
    end: formatDateISO(year, DECEMBER, LAST_DAY_OF_DECEMBER)
  }
}

/**
 * Whether `year` is later than the current calendar year — a year that
 * hasn't started yet, so nothing can be valid for it.
 * @param {number} year
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isFutureYear(year, now = new Date()) {
  return year > currentUtcYear(now)
}
