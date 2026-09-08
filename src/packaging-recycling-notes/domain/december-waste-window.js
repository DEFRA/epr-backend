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
 * inside British Summer Time. Resolved by formatting the real instant to a
 * UK-local string via `Intl.DateTimeFormat` and comparing strings, not by
 * constructing a UK-local instant from wall-clock fields - the latter needs
 * hand-rolled DST arithmetic and produced a silently wrong result by an hour
 * when tried during design.
 */

const UK_TIME_ZONE = 'Europe/London'

const ukDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

/**
 * @param {Date} date
 * @returns {string} `YYYY-MM-DDTHH:mm` in UK local time
 */
function formatUkDateTime(date) {
  /** @type {Record<string, string>} */
  const parts = ukDateTimeFormatter
    .formatToParts(date)
    .reduce((acc, { type, value }) => ({ ...acc, [type]: value }), {})

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

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
  const stamp = formatUkDateTime(now)
  const start = `${relevantYear}-${windowStart}`

  return stamp >= start && isBeforeEndOfRelevantYear(relevantYear, now)
}
