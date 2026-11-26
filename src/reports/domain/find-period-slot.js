/** @import {PeriodicReport, ReportPerPeriod} from '#reports/repository/port.js' */
/** @import {PeriodRef} from './period-key.js' */
/** @import {Cadence} from './cadence.js' */

/**
 * @param {PeriodicReport | null} periodicReport
 * @param {Pick<PeriodRef, 'cadence' | 'period'>} period
 * @returns {ReportPerPeriod | null}
 */
export const findPeriodSlot = (periodicReport, { cadence, period }) =>
  periodicReport?.reports?.[/** @type {Cadence} */ (cadence)]?.[period] ?? null
