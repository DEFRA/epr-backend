import { calendarDate } from '#common/helpers/date-formatter.js'
import { dayBefore } from '#common/helpers/dates/calendar-day.js'
import {
  lastDayOfYear,
  utcYearOf,
  yearsFromTo
} from '#common/helpers/dates/year.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { StatusTimeline } from './model.js' */

/**
 * Each status and when it takes effect.
 *
 * @typedef {Pick<StatusTimeline<string>[number], 'status' | 'at'>[]} StatusChanges
 */

/**
 * A stretch of calendar days, both ends included.
 *
 * @typedef {{ from: CalendarDate, to: CalendarDate }} CalendarDateRange
 */

/**
 * One status per day, keyed by ISO 8601 date (ADR-0051).
 *
 * @template {string} S
 * @typedef {Record<CalendarDate, { status: S }>} DailyTimeline
 */

/**
 * When the timeline's first approval takes effect, or none when it has not
 * been approved.
 *
 * @param {StatusChanges} timeline - oldest first
 * @returns {string | undefined}
 */
export const firstApprovedAt = (timeline) =>
  timeline.find(({ status }) => status === 'approved')?.at

/**
 * @param {CalendarDateRange} range
 * @returns {Year[]}
 */
const yearsIn = ({ from, to }) => yearsFromTo(utcYearOf(from), utcYearOf(to))

/**
 * @param {DailyTimeline<string>} daily
 * @param {CalendarDate} date
 * @returns {CalendarDate[]}
 */
const datesUpTo = (daily, date) =>
  Object.keys(daily)
    .map(calendarDate)
    .filter((candidate) => candidate.localeCompare(date) <= 0)

/**
 * A status holds until the day before the next one starts; the latest status
 * holds until `date`.
 *
 * @param {CalendarDate | undefined} nextDate
 * @param {CalendarDate} date
 * @returns {CalendarDate}
 */
const rangeEnd = (nextDate, date) => (nextDate ? dayBefore(nextDate) : date)

/**
 * The status at the end of each UTC day with a change.
 *
 * @template {string} S
 * @param {StatusTimeline<S>} timeline
 * @returns {DailyTimeline<S>}
 */
const dailyTimeline = (timeline) =>
  Object.fromEntries(
    timeline.map(({ status, at }) => [calendarDate(at), { status }])
  )

/**
 * The date ranges the timeline was approved, oldest first. The latest status
 * holds until `endDate`, and changes after it are left out.
 *
 * @param {StatusChanges} timeline
 * @param {CalendarDate} endDate
 * @returns {CalendarDateRange[]}
 */
const approvedRanges = (timeline, endDate) => {
  const daily = dailyTimeline(timeline)
  const dates = datesUpTo(daily, endDate)
  return dates
    .map((from, index) => ({ from, to: rangeEnd(dates[index + 1], endDate) }))
    .filter(({ from }) => daily[from].status === 'approved')
}

/**
 * Whether the timeline was approved at the end of any day on or before
 * `date`. An approval cancelled the same day does not count.
 *
 * @param {StatusChanges} timeline
 * @param {CalendarDate} date
 * @returns {boolean}
 */
export const approvedBy = (timeline, date) =>
  approvedRanges(timeline, date).length > 0

/**
 * The years up to `upToYear` approved at some point, oldest first, without
 * repeats. The timeline can go approved → cancelled → approved, so years spent
 * wholly cancelled are left out.
 *
 * @param {StatusChanges} timeline
 * @param {Year} upToYear
 * @returns {Year[]}
 */
export const approvedYears = (timeline, upToYear) => [
  ...new Set(approvedRanges(timeline, lastDayOfYear(upToYear)).flatMap(yearsIn))
]
