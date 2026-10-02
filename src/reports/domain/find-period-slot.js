/** @import {PeriodicReport, ReportPerPeriod} from '#reports/repository/port.js' */
/** @import {PeriodRef} from './period-key.js' */
/** @import {Cadence} from './cadence.js' */

/**
 * @param {PeriodicReport[]} periodicReports
 * @param {PeriodRef} period
 * @returns {ReportPerPeriod | null}
 */
export const findPeriodSlot = (periodicReports, { year, cadence, period }) =>
  periodicReports.find((pr) => pr.year === year)?.reports?.[
    /** @type {Cadence} */ (cadence)
  ]?.[period] ?? null
