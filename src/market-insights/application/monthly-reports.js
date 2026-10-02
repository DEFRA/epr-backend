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
import { calendarDate } from '#common/helpers/date-formatter.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { StatusHistoryDateTime } from '#common/helpers/dates/accreditation.js' */
/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { CoversRegistration } from '#market-insights/application/accredited-months.js' */
/** @import { MergedPeriod } from '#reports/domain/merge-reporting-periods.js' */

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
 * Whether the accreditation stood cancelled when the given day ended on the UK
 * calendar. The latest status change dated on or before the day decides it.
 *
 * @param {CalendarDate} day
 * @param {StatusHistoryDateTime[]} history - descending
 */
const isCancelledAtEndOf = (day, history) =>
  history.find(
    ({ updatedAt }) =>
      calendarDate(
        formatLocalDateTime(new Date(updatedAt), UK_TIME_ZONE)
      ).localeCompare(day) <= 0
  )?.status === ACCREDITATION_STATUS.CANCELLED

/**
 * Whether the accreditation owed the period's report. It owed it if it had not
 * been cancelled by the time the report fell due, since a cancelled
 * accreditation can no longer file monthly. A report filed in the time
 * between the month ending and a cancellation still counts. A suspended
 * accreditation keeps reporting, and a reinstated one owes any report not yet
 * due when it was reinstated.
 *
 * @param {Pick<MergedPeriod, 'endDate' | 'dueDate'>} period
 * @param {boolean} submitted
 * @param {StatusHistoryDateTime[]} history - descending
 */
const isOwed = ({ endDate, dueDate }, submitted, history) =>
  !isCancelledAtEndOf(dueDate, history) ||
  (submitted && !isCancelledAtEndOf(endDate, history))

/**
 * The monthly periods among the months served that fall within the
 * accreditation's validity window. The caller has already settled which months
 * have ended, on the UK calendar, so no clock is consulted here.
 *
 * @param {Set<YearMonth>} served
 * @param {number[]} years
 * @param {Accreditation} accreditation
 */
const periodsInWindow = (served, years, accreditation) => {
  const window = accreditationWindow(accreditation)
  if (window === null) {
    return []
  }
  return filterPeriodsFromDate(
    years.flatMap((year) => generateAllPeriodsForYear(CADENCE.monthly, year)),
    window.validFrom,
    window.validTo
  ).filter((period) => served.has(toYearMonth(period.startDate)))
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
 * for every month of its window whose report fell due before any
 * cancellation, or that it filed before being cancelled.
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
    const inWindow = periodsInWindow(served, years, accreditation)
    const windowMonths = new Set(inWindow.map((p) => toYearMonth(p.startDate)))
    const history = getStatusHistoryDateTimes(accreditation.statusHistory)
    const reports =
      reportsByRegistration.get(`${org.id}::${registration.id}`) ?? []

    // The merge also appends any report the operator submitted for a month
    // outside its window, and those count for nothing.
    for (const period of mergeReportingPeriods(
      inWindow,
      reports,
      CADENCE.monthly
    )) {
      const month = toYearMonth(period.startDate)
      if (!windowMonths.has(month)) {
        continue
      }
      const submitted =
        selectSubmittedReports({
          current: period.report,
          previousSubmissions: period.previousSubmissions
        }).length > 0
      if (!isOwed(period, submitted, history)) {
        continue
      }
      yield { month, org, registration, accreditation, submitted }
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
