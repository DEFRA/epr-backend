import { REPORT_STATUS } from './report-status.js'

/**
 * @import { ReportStatus } from './report-status.js'
 */

/**
 * Allowed status transitions for reports.
 * Each key maps to the list of statuses it can transition to.
 * Delete is a separate hard-delete operation, not a status transition.
 *
 * @type {Record<ReportStatus, ReportStatus[]>}
 */
export const REPORT_STATUS_TRANSITIONS = Object.freeze({
  [REPORT_STATUS.IN_PROGRESS]: [REPORT_STATUS.READY_TO_SUBMIT],
  [REPORT_STATUS.READY_TO_SUBMIT]: [REPORT_STATUS.SUBMITTED],
  [REPORT_STATUS.SUBMITTED]: []
})

/**
 * Checks whether a status transition is valid.
 * @param {ReportStatus} currentStatus
 * @param {ReportStatus} newStatus
 * @returns {boolean}
 */
export const isValidReportTransition = (currentStatus, newStatus) =>
  REPORT_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false
