import { isNil } from '#common/helpers/is-nil.js'
import { CANCELLED_PRN_STATUSES } from './model.js'

/**
 * @typedef {Object} AggregateTonnageParams
 * @property {Date} startDate
 * @property {Date} endDate
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

  return prns
    .filter((prn) => isInPeriod(prn.status.issued?.at))
    .filter((prn) => !CANCELLED_PRN_STATUSES.has(prn.status.currentStatus))
    .reduce((total, prn) => total + prn.tonnage, 0)
}
