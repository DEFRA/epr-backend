/**
 * @typedef {Object} AggregateTonnageParams
 * @property {Date} startDate
 * @property {Date} endDate
 */

/**
 * Aggregates tonnage from PRNs where issued.at falls within the period.
 *
 * The reporting period is always determined by when the PRN was issued
 * (status.issued.at), regardless of when it was accepted or cancelled.
 *
 * @param {import('./model.js').PackagingRecyclingNote[]} prns
 * @param {AggregateTonnageParams} params
 * @returns {number}
 */
export function aggregateIssuedTonnage(prns, { startDate, endDate }) {
  const isInPeriod = (at) => at != null && at >= startDate && at <= endDate

  return prns
    .filter((prn) => isInPeriod(prn.status.issued?.at))
    .reduce((total, prn) => total + prn.tonnage, 0)
}
