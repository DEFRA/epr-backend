/**
 * Filters reporting periods to those not entirely before a start date.
 *
 * A period is kept when its end date is on or after `fromDate`, so the period
 * containing `fromDate` is retained (inclusive boundary) and periods that ended
 * before it are dropped. Both `endDate` and `fromDate` are `YYYY-MM-DD` strings,
 * which sort chronologically under a lexical comparison — safe including the
 * `endDate === fromDate` boundary (matching the string-date ordering used in
 * derive-period-status.js).
 *
 * Pure and cadence-agnostic: the caller decides when to apply it (monthly only,
 * for the accreditation `validFrom` trim).
 *
 * @template {{ endDate: string }} T
 * @param {T[]} periods
 * @param {string} fromDate - ISO `YYYY-MM-DD` start date
 * @returns {T[]}
 */
export function filterPeriodsFromDate(periods, fromDate) {
  return periods.filter((period) => period.endDate.localeCompare(fromDate) >= 0)
}
