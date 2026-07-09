/**
 * Filters reporting periods to those overlapping a date window.
 *
 * A period is kept when it is not entirely before `fromDate` (its `endDate` is
 * on or after `fromDate`) and — when an upper bound is supplied — not entirely
 * after `toDate` (its `startDate` is on or before `toDate`). The boundary
 * periods, those containing `fromDate` or `toDate`, are kept (inclusive). All
 * dates are `YYYY-MM-DD` strings, which sort chronologically under a lexical
 * comparison (matching the string-date ordering in derive-period-status.js), so
 * the `=== fromDate` / `=== toDate` boundaries are safe.
 *
 * `toDate` is optional: omit it to trim the lower bound only (the accreditation
 * `validFrom` front trim). It exists for the forthcoming back trim (e.g. a
 * cancellation date) so callers won't need to change the signature then.
 *
 * Pure and cadence-agnostic: the caller decides when to apply it.
 *
 * @template {{ startDate: string, endDate: string }} T
 * @param {T[]} periods
 * @param {string} fromDate - ISO `YYYY-MM-DD` inclusive lower bound
 * @param {string} [toDate] - ISO `YYYY-MM-DD` inclusive upper bound (open when omitted)
 * @returns {T[]}
 */
export function filterPeriodsFromDate(periods, fromDate, toDate) {
  return periods.filter(
    (period) =>
      period.endDate.localeCompare(fromDate) >= 0 &&
      (toDate === undefined || period.startDate.localeCompare(toDate) <= 0)
  )
}
