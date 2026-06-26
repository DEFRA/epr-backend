import { REPORT_STATUS } from './report-status.js'

/**
 * Derived status of a reporting period: the superset of the stored report
 * lifecycle statuses plus the date-derived "due" and "overdue" states.
 */
export const PERIOD_STATUS = Object.freeze({
  DUE: 'due',
  OVERDUE: 'overdue',
  IN_PROGRESS: REPORT_STATUS.IN_PROGRESS,
  READY_TO_SUBMIT: REPORT_STATUS.READY_TO_SUBMIT,
  SUBMITTED: REPORT_STATUS.SUBMITTED
})

/**
 * @typedef {typeof PERIOD_STATUS[keyof typeof PERIOD_STATUS]} PeriodStatus
 */
