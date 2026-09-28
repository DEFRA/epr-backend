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
  accreditationWindow,
  getStatusHistoryDateTimes
} from '#common/helpers/dates/accreditation.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import { grantedRegistrations } from '#market-insights/application/accredited-months.js'
import { recordOf } from '#common/helpers/record-of.js'
import { formatLocalDateTime } from '#common/helpers/dates/local-datetime.js'
import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { StatusHistoryDateTime } from '#common/helpers/dates/accreditation.js' */
/** @import { CoversRegistration } from '#market-insights/application/accredited-months.js' */

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
 * @property {Record<YearMonth, ReportCount>} byMonth - keyed by month served
 * @property {ReportCount} total - summed across every month served
 */

/**
 * Whether the accreditation stood cancelled when the month ended on the UK
 * calendar, so that the month's report fell due after the cancellation. The
 * latest status change dated in or before the month decides it.
 *
 * @param {YearMonth} month
 * @param {StatusHistoryDateTime[]} history - descending
 */
const isCancelledByEndOf = (month, history) =>
  history.find(
    ({ updatedAt }) =>
      toYearMonth(formatLocalDateTime(new Date(updatedAt), UK_TIME_ZONE)) <=
      month
  )?.status === ACCREDITATION_STATUS.CANCELLED

/**
 * The monthly periods an accreditation owed among the months served: those
 * within its validity window that it had not been cancelled by the end of. A
 * suspended accreditation keeps reporting; a cancelled one stops from the
 * month it was cancelled in, and starts again if reinstated before a month
 * ends. The caller has already settled which months have ended, on the UK
 * calendar, so no clock is consulted here.
 *
 * @param {Set<YearMonth>} served
 * @param {number[]} years
 * @param {Accreditation} accreditation
 */
const owedPeriods = (served, years, accreditation) => {
  const window = accreditationWindow(accreditation)
  if (window === null) {
    return []
  }
  const history = getStatusHistoryDateTimes(accreditation.statusHistory)
  return filterPeriodsFromDate(
    years.flatMap((year) => generateAllPeriodsForYear(CADENCE.monthly, year)),
    window.validFrom,
    window.validTo
  ).filter(
    (period) =>
      served.has(toYearMonth(period.startDate)) &&
      !isCancelledByEndOf(toYearMonth(period.startDate), history)
  )
}

/**
 * One monthly report an accreditation owed for a month served, and whether it
 * has been submitted.
 *
 * @typedef {Object} OwedReport
 * @property {YearMonth} month
 * @property {Organisation} org
 * @property {import('#domain/organisations/registration.js').Registration} registration
 * @property {Accreditation} accreditation
 * @property {boolean} submitted
 */

/**
 * Every monthly report owed among the months served, one per accredited
 * registration and month. Only an accredited registration reports monthly, so
 * a registered-only operator yields nothing. An accreditation owed a report
 * for every month of its window it had not been cancelled by the end of, so
 * one since cancelled yields the months before the one it was cancelled in.
 *
 * @param {Object} params
 * @param {import('#domain/organisations/model.js').Organisation[]} params.organisations
 * @param {import('#reports/repository/port.js').PeriodicReport[]} params.periodicReports
 * @param {YearMonth[]} params.months - the reporting months served
 * @param {CoversRegistration} [params.covers] - narrows the walk to the registrations a caller publishes
 * @returns {Generator<OwedReport>}
 */
export function* owedMonthlyReports({
  organisations,
  periodicReports,
  months,
  covers = () => true
}) {
  const served = new Set(months)
  const years = [...new Set(months.map((month) => Number(month.slice(0, 4))))]
  const reportsByRegistration = groupByRegistration(periodicReports)

  for (const { org, registration, accreditation } of grantedRegistrations(
    organisations,
    covers
  )) {
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
      const month = toYearMonth(period.startDate)
      if (!owedMonths.has(month)) {
        continue
      }
      const submissions = selectSubmittedReports({
        current: period.report,
        previousSubmissions: period.previousSubmissions
      })
      yield {
        month,
        org,
        registration,
        accreditation,
        submitted: submissions.length > 0
      }
    }
  }
}

/**
 * Count, for each month served, the monthly reports that were required and
 * those submitted.
 *
 * @param {YearMonth[]} months - the reporting months served
 * @param {Iterable<OwedReport>} owedReports
 * @returns {MonthlyReportCounts}
 */
export const countMonthlyReports = (months, owedReports) => {
  const owed = Map.groupBy(owedReports, ({ month }) => month)
  const byMonth = recordOf(months, (month) => {
    const reports = owed.get(month) ?? []
    return {
      expected: reports.length,
      submitted: reports.filter(({ submitted }) => submitted).length
    }
  })
  const total = { expected: 0, submitted: 0 }
  for (const { expected, submitted } of Object.values(byMonth)) {
    total.expected += expected
    total.submitted += submitted
  }
  return { byMonth, total }
}
