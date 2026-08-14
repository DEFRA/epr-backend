import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import { PERIOD_STATUS } from './period-status.js'

/**
 * @import { ReportStatus } from './report-status.js'
 * @import { PeriodStatus } from './period-status.js'
 */

/**
 * Derive a reporting period's status from its stored report and period dates.
 *
 * A stored report's lifecycle status takes precedence. Otherwise dates are
 * compared as ISO date strings (YYYY-MM-DD, which sort chronologically): a
 * period is overdue once the current UTC date is past its due date, i.e. from
 * the 21st when the due date is the 20th.
 * @param {{ endDate: string, dueDate: string, report: { status: ReportStatus } | null }} period
 * @returns {PeriodStatus | null}
 */
export const derivePeriodStatus = ({ endDate, dueDate, report }) => {
  if (report !== null) {
    return report.status
  }

  const today = utcCalendarDate(new Date())

  const periodEnded = today.localeCompare(endDate) > 0
  if (!periodEnded) {
    return null
  }

  const overdue = today.localeCompare(dueDate) > 0

  return overdue ? PERIOD_STATUS.OVERDUE : PERIOD_STATUS.DUE
}
