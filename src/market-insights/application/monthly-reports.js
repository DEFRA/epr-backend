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
  accreditationsForRegistration,
  getReportableRegistrations
} from '#domain/organisations/registration-utils.js'
import {
  accreditationWindow,
  getStatusHistoryDateTimes,
  statusHeldAt
} from '#common/helpers/dates/accreditation.js'
import { toCalendarDate } from '#common/helpers/date-formatter.js'
import {
  ACCREDITATION_STATUS,
  ACTIVE_ACCREDITATION_STATUSES
} from '#domain/organisations/model.js'
import { recordOf } from '#common/helpers/record-of.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { StatusHistoryDateTime } from '#common/helpers/dates/accreditation.js' */

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
 * A registration the walk reached, and the accreditation it reports under.
 *
 * @typedef {Object} OwedReportCandidate
 * @property {Organisation} org
 * @property {Registration} registration
 */

/**
 * Whether a caller's publication covers the candidate's registration. A caller
 * publishing figures over part of the register passes one so its count
 * describes the same operators its figures do.
 *
 * @typedef {(candidate: OwedReportCandidate) => boolean} CoversRegistration
 */

/**
 * Whether the accreditation has ever been granted, read from its history
 * rather than from the status it holds now. Only a granted accreditation owes
 * monthly reports, and the schema makes the validity dates optional rather
 * than absent for an accreditation still created or since rejected, so one
 * that carries dates must not be walked as though it were live. Reading the
 * history keeps an approval since reverted to draft, and a cancellation, on
 * the months they held, which `owedPeriods` then bounds.
 *
 * @param {Accreditation} accreditation
 */
const hasBeenGranted = ({ statusHistory }) =>
  statusHistory.some(({ status }) => ACTIVE_ACCREDITATION_STATUSES.has(status))

/**
 * Every day of a reporting period, as the bare dates a load can carry.
 *
 * @param {{ startDate: CalendarDate, endDate: CalendarDate }} period
 * @returns {CalendarDate[]}
 */
const daysOf = ({ startDate, endDate }) => {
  const days = []
  for (
    const day = new Date(startDate);
    toCalendarDate(day).localeCompare(endDate) <= 0;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    days.push(toCalendarDate(day))
  }
  return days
}

/**
 * Whether the accreditation stood cancelled on every day of the period, read
 * from its history exactly as the figures read it for a load dated that day.
 * Asking day by day rather than at each history entry keeps that one answer
 * shared, and costs a year of the register a few hundred thousand lookups
 * over histories of a handful of entries.
 *
 * @param {{ startDate: CalendarDate, endDate: CalendarDate }} period
 * @param {StatusHistoryDateTime[]} history
 */
const isCancelledThroughout = (period, history) =>
  daysOf(period).every(
    (day) => statusHeldAt(day, history) === ACCREDITATION_STATUS.CANCELLED
  )

/**
 * The monthly periods an accreditation owed among the months served: those
 * within its validity window that it did not stand cancelled throughout. A
 * suspended accreditation keeps reporting; a cancelled one stops, and starts
 * again if reinstated. The caller has already settled which months have
 * ended, on the UK calendar, so no clock is consulted here.
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
      !isCancelledThroughout(period, history)
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
 * for every month of its window it was not cancelled for, so one since
 * cancelled yields the months before its cancellation.
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

  for (const { org, registration } of getReportableRegistrations(
    organisations
  )) {
    const [accreditation] = accreditationsForRegistration(registration, org)
    if (
      accreditation === undefined ||
      !hasBeenGranted(accreditation) ||
      !covers({ org, registration })
    ) {
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
