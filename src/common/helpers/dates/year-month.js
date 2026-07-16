/**
 * Extracts the year-month portion from an ISO date string.
 * e.g. '2026-03-01' → '2026-03'
 *
 * @param {string} isoDate - An ISO date string (YYYY-MM-DD or longer)
 * @returns {string} Year-month in YYYY-MM format
 */
export const YEAR_MONTH_LENGTH = 7

export const toYearMonth = (isoDate) => isoDate.slice(0, YEAR_MONTH_LENGTH)

/** @type {Map<string, Intl.DateTimeFormat>} */
const monthKeyFormatters = new Map()

/**
 * Memoised year/month formatter for an IANA time zone — building an
 * `Intl.DateTimeFormat` is comparatively expensive and this is called per row.
 *
 * @param {string} timeZone
 * @returns {Intl.DateTimeFormat}
 */
const monthKeyFormatter = (timeZone) => {
  let formatter = monthKeyFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit'
    })
    monthKeyFormatters.set(timeZone, formatter)
  }
  return formatter
}

/**
 * The `YYYY-MM` calendar month a date value falls in, in the given IANA time
 * zone (default UTC), or `null` when the value is missing or unparseable.
 * `null`/`undefined` are guarded explicitly because `new Date(null)` is the
 * epoch, not an invalid date.
 *
 * @param {unknown} value - a `Date`, or a value `new Date` can parse
 * @param {string} [timeZone] - IANA time zone; defaults to `UTC`
 * @returns {string | null}
 */
export const monthKeyForDate = (value, timeZone = 'UTC') => {
  if (value === null || value === undefined) {
    return null
  }
  const date =
    value instanceof Date ? value : new Date(/** @type {any} */ (value))
  if (Number.isNaN(date.getTime())) {
    return null
  }
  let year = ''
  let month = ''
  for (const part of monthKeyFormatter(timeZone).formatToParts(date)) {
    if (part.type === 'year') {
      year = part.value
    } else if (part.type === 'month') {
      month = part.value
    }
  }
  return `${year}-${month}`
}
