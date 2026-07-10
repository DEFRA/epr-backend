import { isNil } from '#common/helpers/is-nil.js'
import { CANCELLED_PRN_STATUSES } from './model.js'

/**
 * @typedef {Object} AggregateTonnageParams
 * @property {Date} startDate - A concrete instant, not a calendar-date
 *   string. Callers must have already expanded a calendar-date string via
 *   startOfDay() from #common/helpers/date-formatter.js.
 * @property {Date} endDate - A concrete instant. Callers must have already
 *   expanded a calendar-date string via endOfDay() from
 *   #common/helpers/date-formatter.js.
 */

/**
 * Aggregates tonnage from PRNs where issued.at falls within the period.
 *
 * The reporting period is always determined by when the PRN was issued
 * (status.issued.at), regardless of when it was accepted. PRNs whose current
 * status is Cancelled or Awaiting Cancellation are excluded, even if they
 * were issued within the period.
 *
 * @param {import('./model.js').PackagingRecyclingNote[]} prns
 * @param {AggregateTonnageParams} params
 * @returns {number}
 */
export function aggregateIssuedTonnage(prns, { startDate, endDate }) {
  const isInPeriod = (at) => !isNil(at) && at >= startDate && at <= endDate

  const isIssuedInPeriod = (prn) => isInPeriod(prn.status.issued?.at)

  const isNotCancelled = (prn) =>
    !CANCELLED_PRN_STATUSES.has(prn.status.currentStatus)

  return prns
    .filter(isIssuedInPeriod)
    .filter(isNotCancelled)
    .reduce((total, prn) => total + prn.tonnage, 0)
}
