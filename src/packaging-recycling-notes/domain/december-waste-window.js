import { formatLocalDateTime } from '#common/helpers/dates/local-datetime.js'
import { isBeforeEndOfRelevantYear } from '#packaging-recycling-notes/domain/relevant-year.js'

/**
 * The December Waste declaration window (PAE-1913): a reprocessor on output
 * may mark a PRN as December Waste from `windowStart` of the accreditation's
 * relevant year through 31 January the year after - the same relevant-year
 * deadline `relevant-year.js` already states for cancellation, so the upper
 * bound is composed from there rather than restated. Only the start is
 * configurable (a lower-environment override); the end is never anything
 * other than the relevant-year boundary.
 *
 * `windowStart` is resolved against `now` in UK local time (Europe/London),
 * because unlike `relevant-year.js`'s fixed 31 January boundary (always GMT
 * by coincidence) a configured start can fall in any month, including one
 * inside British Summer Time.
 */

const UK_TIME_ZONE = 'Europe/London'

/**
 * Whether `now` falls within the December Waste declaration window for an
 * accreditation of `relevantYear`.
 *
 * @param {number} relevantYear
 * @param {Date} now
 * @param {{ windowStart: string }} config - `windowStart` as `MM-DDTHH:mm`
 * @returns {boolean}
 */
export function isWithinDecemberWasteWindow(
  relevantYear,
  now,
  { windowStart }
) {
  const stamp = formatLocalDateTime(now, UK_TIME_ZONE)
  const start = `${relevantYear}-${windowStart}`

  // Deliberate string comparison, not numeric: both sides are zero-padded
  // `YYYY-MM-DDTHH:mm` and sort chronologically as strings - that is the
  // whole point of the format, see formatLocalDateTime.
  return stamp >= start && isBeforeEndOfRelevantYear(relevantYear, now)
}
