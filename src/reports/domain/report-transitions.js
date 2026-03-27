import { REPORT_STATUS } from './report-status.js'

/**
 * Allowed status transitions for reports.
 * Each key maps to the list of statuses it can transition to.
 * @type {Record<string, string[]>}
 */
export const REPORT_STATUS_TRANSITIONS = Object.freeze({
  [REPORT_STATUS.IN_PROGRESS]: [
    REPORT_STATUS.READY_TO_SUBMIT,
    REPORT_STATUS.DELETED
  ],
  [REPORT_STATUS.READY_TO_SUBMIT]: [
    REPORT_STATUS.SUBMITTED,
    REPORT_STATUS.DELETED
  ],
  [REPORT_STATUS.SUBMITTED]: [REPORT_STATUS.SUPERSEDED],
  [REPORT_STATUS.SUPERSEDED]: [],
  [REPORT_STATUS.DELETED]: []
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
