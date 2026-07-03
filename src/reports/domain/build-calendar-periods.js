import { derivePeriodStatus } from './derive-period-status.js'
import { PERIOD_STATUS } from './period-status.js'

/**
 * @import { MergedPeriod } from './merge-reporting-periods.js'
 * @import { PeriodStatus } from './period-status.js'
 */

/**
 * @typedef {MergedPeriod & { periodStatus: PeriodStatus | null }} CalendarPeriod
 */

/**
 * Expands merged reporting periods into the submission-grained calendar items.
 *
 * Each period yields one item carrying its derived periodStatus. A period whose
 * latest submitted report was restated by a later summary log yields an extra
 * "requires resubmission" skeleton item at the next submission number, prompting
 * a correction; the original submitted item is kept alongside it.
 *
 * @param {MergedPeriod[]} mergedPeriods
 * @returns {CalendarPeriod[]}
 */
export const buildCalendarPeriods = (mergedPeriods) =>
  mergedPeriods.flatMap((period) => {
    const item = { ...period, periodStatus: derivePeriodStatus(period) }

    const current = period.report
    if (!current?.resubmissionRequired) {
      return [item]
    }

    return [
      item,
      {
        ...period,
        submissionNumber: current.submissionNumber + 1,
        periodStatus: PERIOD_STATUS.REQUIRES_RESUBMISSION,
        report: null
      }
    ]
  })
