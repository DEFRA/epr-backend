import { dayAfter, dayBefore } from './calendar-day.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */

/**
 * A stretch of calendar days, both ends included.
 *
 * @typedef {{ from: CalendarDate, to: CalendarDate }} CalendarDateRange
 */

/**
 * @param {CalendarDate} a
 * @param {CalendarDate} b
 * @returns {CalendarDate} the later of the two dates
 */
const later = (a, b) => (a.localeCompare(b) > 0 ? a : b)

/**
 * @param {CalendarDate} a
 * @param {CalendarDate} b
 * @returns {CalendarDate} the earlier of the two dates
 */
const earlier = (a, b) => (a.localeCompare(b) < 0 ? a : b)

/**
 * Keeps only the part of each range that lies inside `bounds`. A range that
 * sticks out is cut at the bounds, and a range wholly outside is dropped.
 *
 * With bounds 1 Jan to 31 Dec 2026:
 * - 1 Jun 2025 to 14 Feb 2026 becomes 1 Jan to 14 Feb 2026
 * - 1 Mar to 30 Apr 2026 is unchanged
 * - 1 Jan to 31 Dec 2025 is dropped
 *
 * @param {CalendarDateRange[]} ranges
 * @param {CalendarDateRange} bounds
 * @returns {CalendarDateRange[]}
 */
export const restrictDateRanges = (ranges, bounds) =>
  ranges.flatMap(({ from, to }) => {
    const start = later(from, bounds.from)
    const end = earlier(to, bounds.to)
    return start.localeCompare(end) <= 0 ? [{ from: start, to: end }] : []
  })

/**
 * Merges ranges that overlap or sit back to back, so that days which belong
 * together form one range. The result is ordered oldest first and does not
 * change the input.
 *
 * - 1 Jan to 31 May and 1 Jun to 9 Sep become 1 Jan to 9 Sep
 * - 1 Jan to 31 Mar and 1 Sep to 31 Dec stay separate
 *
 * @param {CalendarDateRange[]} ranges
 * @returns {CalendarDateRange[]}
 */
export const joinDateRanges = (ranges) =>
  ranges
    .toSorted((a, b) => a.from.localeCompare(b.from))
    .reduce((joined, range) => {
      const last = joined.at(-1)
      if (last && range.from.localeCompare(dayAfter(last.to)) <= 0) {
        last.to = range.to
      } else {
        joined.push({ ...range })
      }
      return joined
    }, /** @type {CalendarDateRange[]} */ ([]))

/**
 * Takes the days in `removals` out of `ranges`. A removal in the middle of a
 * range splits it in two, and one that covers a range removes it.
 *
 * Removing 15 Feb to 9 Sep from 1 Jan to 31 Dec leaves 1 Jan to 14 Feb and
 * 10 Sep to 31 Dec.
 *
 * @param {CalendarDateRange[]} ranges
 * @param {CalendarDateRange[]} removals
 * @returns {CalendarDateRange[]}
 */
export const subtractDateRanges = (ranges, removals) =>
  removals.reduce(
    (remaining, removal) =>
      remaining.flatMap((range) => [
        ...restrictDateRanges([range], {
          from: range.from,
          to: dayBefore(removal.from)
        }),
        ...restrictDateRanges([range], {
          from: dayAfter(removal.to),
          to: range.to
        })
      ]),
    ranges
  )
