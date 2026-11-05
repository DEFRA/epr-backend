import { calendarDate } from '#common/helpers/date-formatter.js'
import { dayBefore } from '#common/helpers/dates/calendar-day.js'
import {
  utcYearOf,
  yearBounds,
  yearsFromTo
} from '#common/helpers/dates/year.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { StatusTimeline } from './model.js' */

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
 * @param {CalendarDateRange} range
 * @returns {Year[]}
 */
const yearsIn = ({ from, to }) => yearsFromTo(utcYearOf(from), utcYearOf(to))

/**
 * @param {DailyTimeline} daily
 * @param {CalendarDate} today
 * @returns {CalendarDate[]}
 */
const datesUpTo = (daily, today) =>
  Object.keys(daily)
    .map(calendarDate)
    .filter((date) => date.localeCompare(today) <= 0)

/**
 * A status holds until the day before the next one starts; the latest status
 * holds until `latestEnd`.
 *
 * @param {CalendarDate | undefined} nextDate
 * @param {CalendarDate} latestEnd
 * @returns {CalendarDate}
 */
const rangeEnd = (nextDate, latestEnd) =>
  nextDate ? dayBefore(nextDate) : latestEnd

/**
 * The status at the end of each UTC day with a change.
 *
 * @param {StatusTimeline} timeline
 * @returns {DailyTimeline}
 */
export const dailyTimeline = (timeline) =>
  Object.fromEntries(
    timeline.map(({ status, at }) => [calendarDate(at), { status }])
  )

/**
 * The date ranges each status was held, keyed by status.
 *
 * @param {StatusTimeline} timeline
 * @param {CalendarDate} today
 * @param {CalendarDate} [latestEnd]
 * @returns {Partial<Record<string, CalendarDateRange[]>>}
 */
export const statusRanges = (timeline, today, latestEnd = today) => {
  const daily = dailyTimeline(timeline)
  const dates = datesUpTo(daily, today)

  /** @type {Partial<Record<string, CalendarDateRange[]>>} */
  const ranges = {}

  for (let i = 0; i < dates.length; i++) {
    const from = dates[i]
    const to = rangeEnd(dates[i + 1], latestEnd)
    const { status } = daily[from]

    ranges[status] ??= []
    ranges[status].push({ from, to })
  }

  return ranges
}

/**
 * Oldest first, without repeats. The timeline can go approved → cancelled → approved, so years
 * spent wholly cancelled are left out.
 *
 * @param {StatusTimeline} timeline
 * @param {CalendarDate} today
 * @param {Year} latestOpenYear
 * @returns {Year[]}
 */
export const approvedYears = (timeline, today, latestOpenYear) => {
  const { end } = yearBounds(latestOpenYear)
  const approvedRanges = statusRanges(timeline, today, end).approved ?? []
  return [...new Set(approvedRanges.flatMap(yearsIn))]
}
