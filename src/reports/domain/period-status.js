import { REPORT_STATUS } from './report-status.js'

/**
 * Derived status of a reporting period: the superset of the stored report
 * lifecycle statuses, the date-derived "due" and "overdue" states, and
 * "requires resubmission" (a submitted period restated by a later summary log).
 */
export const PERIOD_STATUS = Object.freeze({
  ...REPORT_STATUS,
  DUE: 'due',
  OVERDUE: 'overdue',
  REQUIRES_RESUBMISSION: 'requires_resubmission'
})

/**
 * @typedef {typeof PERIOD_STATUS[keyof typeof PERIOD_STATUS]} PeriodStatus
 */
