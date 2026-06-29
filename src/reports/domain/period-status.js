import { REPORT_STATUS } from './report-status.js'

/**
 * Derived status of a reporting period: the superset of the stored report
 * lifecycle statuses plus the date-derived "due" and "overdue" states.
 */
export const PERIOD_STATUS = Object.freeze({
  ...REPORT_STATUS,
  DUE: 'due',
  OVERDUE: 'overdue'
})

/**
 * @typedef {typeof PERIOD_STATUS[keyof typeof PERIOD_STATUS]} PeriodStatus
 */
