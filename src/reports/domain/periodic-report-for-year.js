/** @import {Year} from '#common/helpers/dates/year.js' */
/** @import {PeriodicReport} from '#reports/repository/port.js' */

/**
 * A registration's periodic report for one year, from its reports of every year.
 *
 * @param {PeriodicReport[]} storedReports
 * @param {Year} year
 * @returns {PeriodicReport | null}
 */
export const periodicReportForYear = (storedReports, year) =>
  storedReports.find((report) => report.year === year) ?? null
