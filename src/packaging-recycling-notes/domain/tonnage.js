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
  const changesInPeriod = (prn) =>
    prn.status.history.filter((e) => e.at >= startDate && e.at <= endDate)

  const hasMatchingLatestStatus = (prn) => {
    const changes = changesInPeriod(prn)
    return changes.length > 0 && statuses.includes(changes.at(-1).status)
  }

  return prns
    .filter(hasMatchingLatestStatus)
    .reduce((total, prn) => total + prn.tonnage, 0)
}
