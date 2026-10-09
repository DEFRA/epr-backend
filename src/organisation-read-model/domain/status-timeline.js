/** @import { StatusTimeline } from './model.js' */

/** @typedef {{ from: string, to: string }} DateRange */

/**
 * @param {string} date - ISO 8601 date
 * @returns {string}
 */
const dayBefore = (date) => {
  const day = new Date(date)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}

/**
 * @param {string} date - ISO 8601 date
 * @returns {number}
 */
const yearOf = (date) => new Date(date).getUTCFullYear()

/**
 * @param {DateRange} range
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
 * @param {string} today - ISO 8601 date
 * @returns {string[]}
 */
const datesUpTo = (timeline, today) => {
  const dates = Object.keys(timeline).filter(
    (date) => date.localeCompare(today) <= 0
  )
  return dates.sort((a, b) => a.localeCompare(b))
}

/**
 * A status holds until the day before the next one starts; the latest status
 * holds until today.
 *
 * @param {string | undefined} nextDate - ISO 8601 date
 * @param {string} today - ISO 8601 date
 * @returns {string}
 */
const rangeEnd = (nextDate, today) => (nextDate ? dayBefore(nextDate) : today)

/**
 * The date ranges each status was held, keyed by status.
 *
 * @param {StatusTimeline} timeline
 * @param {string} today - ISO 8601 date
 * @returns {Partial<Record<string, DateRange[]>>}
 */
export const statusRanges = (timeline, today) => {
  const dates = datesUpTo(timeline, today)

  /** @type {Partial<Record<string, DateRange[]>>} */
  const ranges = {}

  for (let i = 0; i < dates.length; i++) {
    const from = dates[i]
    const to = rangeEnd(dates[i + 1], today)
    const { status } = timeline[from]

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
 * @param {string} today - ISO 8601 date
 * @returns {number[]}
 */
export const approvedYears = (timeline, today) => {
  const approvedRanges = statusRanges(timeline, today).approved ?? []
  return [...new Set(approvedRanges.flatMap(yearsIn))]
}
