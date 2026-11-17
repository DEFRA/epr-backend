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
 * @typedef {Pick<StatusTimeline[number], 'status' | 'at'>[]} StatusChanges
 */

/**
 * A stretch of calendar days, both ends included.
 *
 * @typedef {{ from: CalendarDate, to: CalendarDate }} CalendarDateRange
 */

/**
 * One status per day, keyed by ISO 8601 date (ADR-0051).
 *
 * @typedef {Record<CalendarDate, { status: string }>} DailyTimeline
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
 * @param {DailyTimeline} daily
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
 * @param {StatusChanges} timeline
 * @returns {DailyTimeline}
 */
const dailyTimeline = (timeline) =>
  Object.fromEntries(
    timeline.map(({ status, at }) => [calendarDate(at), { status }])
  )

/**
 * The date ranges each status was held, keyed by status. The latest status
 * holds until `endDate`, and changes after it are left out.
 *
 * @param {StatusChanges} timeline
 * @param {CalendarDate} endDate
 * @returns {Partial<Record<string, CalendarDateRange[]>>}
 */
const statusRanges = (timeline, endDate) => {
  const daily = dailyTimeline(timeline)
  const dates = datesUpTo(daily, endDate)

  /** @type {Partial<Record<string, CalendarDateRange[]>>} */
  const ranges = {}

  for (let i = 0; i < dates.length; i++) {
    const from = dates[i]
    const to = rangeEnd(dates[i + 1], endDate)
    const { status } = daily[from]

    ranges[status] ??= []
    ranges[status].push({ from, to })
  }

  return ranges
}

/**
 * The years up to `upToYear` approved at some point, oldest first, without
 * repeats. The timeline can go approved → cancelled → approved, so years spent
 * wholly cancelled are left out.
 *
 * @param {StatusChanges} timeline
 * @param {Year} upToYear
 * @returns {Year[]}
 */
export const approvedYears = (timeline, upToYear) => {
  const approvedRanges =
    statusRanges(timeline, lastDayOfYear(upToYear)).approved ?? []
  return [...new Set(approvedRanges.flatMap(yearsIn))]
}
