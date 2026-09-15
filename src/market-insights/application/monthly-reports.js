import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import { filterPeriodsFromDate } from '#reports/domain/filter-periods-from-date.js'
import {
  mergeReportingPeriods,
  selectSubmittedReports
} from '#reports/domain/merge-reporting-periods.js'
import { groupByRegistration } from '#reports/application/report-compliance.js'
import {
  getReportableRegistrations,
  resolveAccreditation
} from '#domain/organisations/registration-utils.js'

/**
 * The monthly reports owed and how many of them have been submitted.
 *
 * @typedef {Object} ReportCount
 * @property {number} expected
 * @property {number} submitted
 */

/**
 * How close each month served is to publication, and the period as a whole.
 *
 * @typedef {Object} MonthlyReportCounts
 * @property {Array<ReportCount & { month: string }>} byMonth - one per month served, in the order given, `YYYY-MM`
 * @property {ReportCount} total - summed across every month served
 */

/**
 * The monthly periods an accreditation owes among the months served: those
 * within its validity. The caller has already settled which months have
 * ended, on the UK calendar, so no clock is consulted here.
 *
 * @param {Set<string>} served - `YYYY-MM` keys
 * @param {number[]} years
 * @param {{ validFrom: string, validTo: string }} accreditation
 */
const owedPeriods = (served, years, { validFrom, validTo }) =>
  filterPeriodsFromDate(
    years.flatMap((year) => generateAllPeriodsForYear(CADENCE.monthly, year)),
    validFrom,
    validTo
  ).filter((period) => served.has(toYearMonth(period.startDate)))

/**
 * Count, for each month served, the monthly reports owed and those submitted.
 * Only an accredited registration reports monthly, so a registered-only
 * operator counts for nothing, and only an accreditation the public register
 * lists as active is counted. The figures themselves are drawn from every
 * partition the ledger holds, so tonnage a since-cancelled accreditation
 * submitted stays in the figures while it counts for no report.
 *
 * @param {Object} params
 * @param {import('#domain/organisations/model.js').Organisation[]} params.organisations
 * @param {import('#reports/repository/port.js').PeriodicReport[]} params.periodicReports
 * @param {string[]} params.months - the `YYYY-MM` reporting months served
 * @returns {MonthlyReportCounts}
 */
export const countMonthlyReports = ({
  organisations,
  periodicReports,
  months
}) => {
  const served = new Set(months)
  const years = [...new Set(months.map((month) => Number(month.slice(0, 4))))]
  const reportsByRegistration = groupByRegistration(periodicReports)

  const counts = new Map(
    months.map((month) => [month, { month, expected: 0, submitted: 0 }])
  )
  for (const { org, registration } of getReportableRegistrations(
    organisations
  )) {
    const accreditation = resolveAccreditation(registration, org)
    if (accreditation === null) {
      continue
    }
    const owed = owedPeriods(served, years, accreditation)
    const owedMonths = new Set(owed.map((p) => toYearMonth(p.startDate)))
    const reports =
      reportsByRegistration.get(`${org.id}::${registration.id}`) ?? []

    // The merge also appends any report the operator submitted for a month it
    // does not owe, and those count for nothing.
    for (const period of mergeReportingPeriods(
      owed,
      reports,
      CADENCE.monthly
    )) {
      const count = counts.get(toYearMonth(period.startDate))
      if (count === undefined || !owedMonths.has(count.month)) {
        continue
      }
      count.expected += 1
      const submissions = selectSubmittedReports({
        current: period.report,
        previousSubmissions: period.previousSubmissions
      })
      if (submissions.length > 0) {
        count.submitted += 1
      }
    }
  }
  const byMonth = [...counts.values()]
  const total = { expected: 0, submitted: 0 }
  for (const { expected, submitted } of byMonth) {
    total.expected += expected
    total.submitted += submitted
  }
  return { byMonth, total }
}
