/**
 * @typedef {Object} AggregateTonnageParams
 * @property {Date} startDate
 * @property {Date} endDate
 * @property {import('./model.js').PrnStatus[]} statuses
 */

/**
 * Aggregates tonnage from PRNs using latest-status-in-period semantics.
 * For each PRN, finds the latest history entry within the date window and
 * includes the PRN's tonnage only if that entry's status is in the statuses list.
 *
 * @param {import('./model.js').PackagingRecyclingNote[]} prns
 * @param {AggregateTonnageParams} params
 * @returns {number}
 */
export function aggregateIssuedTonnage(prns, { startDate, endDate, statuses }) {
  return prns.reduce((total, prn) => {
    const inPeriod = prn.status.history.filter(
      (e) => e.at >= startDate && e.at <= endDate
    )
    if (!inPeriod.length) {
      return total
    }
    const latest = inPeriod.at(-1)
    return statuses.includes(latest.status) ? total + prn.tonnage : total
  }, 0)
}
