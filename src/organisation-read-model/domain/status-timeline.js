import {
  calendarDate,
  utcCalendarDate
} from '#common/helpers/date-formatter.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { StatusTimeline } from './model.js' */

/** @typedef {{ from: CalendarDate, to: CalendarDate }} CalendarDateRange */

/**
 * @param {CalendarDate} date
 * @returns {CalendarDate}
 */
const dayBefore = (date) => {
  const day = new Date(date)
  day.setUTCDate(day.getUTCDate() - 1)
  return utcCalendarDate(day)
}

/**
 * @param {CalendarDate} date
 * @returns {number}
 */
const yearOf = (date) => new Date(date).getUTCFullYear()

/**
 * @param {CalendarDateRange} range
 * @returns {number[]}
 */
const yearsIn = ({ from, to }) => {
  const years = []
  for (let year = yearOf(from); year <= yearOf(to); year++) {
    years.push(year)
  }
  return years
}

/**
 * @param {StatusTimeline} timeline
 * @param {CalendarDate} today
 * @returns {CalendarDate[]}
 */
const datesUpTo = (timeline, today) => {
  const dates = Object.keys(timeline)
    .map(calendarDate)
    .filter((date) => date.localeCompare(today) <= 0)
  return dates.sort((a, b) => a.localeCompare(b))
}

/**
 * A status holds until the day before the next one starts; the latest status
 * holds until today.
 *
 * @param {CalendarDate | undefined} nextDate
 * @param {CalendarDate} today
 * @returns {CalendarDate}
 */
const rangeEnd = (nextDate, today) => (nextDate ? dayBefore(nextDate) : today)

/**
 * The status at the end of each UTC day with a change, keyed by ISO 8601 date.
 *
 * @param {StatusTimeline} timeline
 * @returns {StatusTimeline}
 */
export const dailyTimeline = (timeline) =>
  Object.fromEntries(
    Object.keys(timeline)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [calendarDate(key), timeline[key]])
  )

/**
 * The date ranges each status was held, keyed by status.
 *
 * @param {StatusTimeline} timeline
 * @param {CalendarDate} today
 * @returns {Partial<Record<string, CalendarDateRange[]>>}
 */
export const statusRanges = (timeline, today) => {
  const daily = dailyTimeline(timeline)
  const dates = datesUpTo(daily, today)

  /** @type {Partial<Record<string, CalendarDateRange[]>>} */
  const ranges = {}

  for (let i = 0; i < dates.length; i++) {
    const from = dates[i]
    const to = rangeEnd(dates[i + 1], today)
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
 * @returns {number[]}
 */
export const approvedYears = (timeline, today) => {
  const approvedRanges = statusRanges(timeline, today).approved ?? []
  return [...new Set(approvedRanges.flatMap(yearsIn))]
}
