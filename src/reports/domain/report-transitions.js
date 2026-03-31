import { REPORT_STATUS } from './report-status.js'

/**
 * Allowed status transitions for reports.
 * Each key maps to the list of statuses it can transition to.
 * Delete is a separate hard-delete operation, not a status transition.
 * @type {Record<string, string[]>}
 */
export const REPORT_STATUS_TRANSITIONS = Object.freeze({
  [REPORT_STATUS.IN_PROGRESS]: [REPORT_STATUS.READY_TO_SUBMIT],
  [REPORT_STATUS.READY_TO_SUBMIT]: [REPORT_STATUS.SUBMITTED],
  [REPORT_STATUS.SUBMITTED]: []
})

/**
 * Checks whether a status transition is valid.
 * @param {string} currentStatus
 * @param {string} newStatus
 * @returns {boolean}
 */
export function isValidReportTransition(currentStatus, newStatus) {
  const allowed = REPORT_STATUS_TRANSITIONS[currentStatus]
  if (!allowed) {
    return false
  }
  return allowed.includes(newStatus)
}
