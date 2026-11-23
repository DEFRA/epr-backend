import {
  formatDateISO,
  utcCalendarDate
} from '#common/helpers/date-formatter.js'
import { nextYear } from '#common/helpers/dates/year.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */

const FEBRUARY = 1
const MARCH = 2
const LAST_ACCREDITED_CORRECTION_DAY = 27
const LAST_REGISTERED_ONLY_CORRECTION_DAY = 20

/**
 * @typedef {{ registeredOnly: boolean }} CorrectionDeadlineFor
 */

/**
 * The last day summary logs for `year` are accepted.
 *
 * @param {Year} year
 * @param {CorrectionDeadlineFor} registration
 * @returns {CalendarDate}
 */
export const lastCorrectionDay = (year, { registeredOnly }) =>
  registeredOnly
    ? formatDateISO(nextYear(year), MARCH, LAST_REGISTERED_ONLY_CORRECTION_DAY)
    : formatDateISO(nextYear(year), FEBRUARY, LAST_ACCREDITED_CORRECTION_DAY)

/**
 * Whether summary logs for `year` are still accepted at `at`. Both deadlines
 * fall in GMT, so the UTC day is the UK day.
 *
 * @param {Year} year
 * @param {CorrectionDeadlineFor} registration
 * @param {Date} at
 */
export const isBeforeCorrectionDeadline = (year, registration, at) =>
  utcCalendarDate(at) <= lastCorrectionDay(year, registration)
