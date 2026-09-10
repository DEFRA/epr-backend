/** @type {Map<string, Intl.DateTimeFormat>} */
const localDateTimeFormatters = new Map()

/**
 * Memoised date-time formatter for an IANA time zone — building an
 * `Intl.DateTimeFormat` is comparatively expensive.
 *
 * @param {string} timeZone
 * @returns {Intl.DateTimeFormat}
 */
const localDateTimeFormatter = (timeZone) => {
  let formatter = localDateTimeFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
    localDateTimeFormatters.set(timeZone, formatter)
  }
  return formatter
}

/**
 * Formats an instant as `YYYY-MM-DDTHH:mm` in the given IANA time zone.
 *
 * Never construct a local instant from wall-clock fields instead of using
 * this - that needs hand-rolled DST arithmetic and is easy to get subtly
 * wrong. Always go the other way: format the real instant to a local string
 * and compare strings.
 *
 * @param {Date} date
 * @param {string} timeZone - IANA time zone, e.g. 'Europe/London'
 * @returns {string}
 */
export function formatLocalDateTime(date, timeZone) {
  /** @type {Record<string, string>} */
  const parts = localDateTimeFormatter(timeZone)
    .formatToParts(date)
    .reduce((acc, { type, value }) => ({ ...acc, [type]: value }), {})

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
