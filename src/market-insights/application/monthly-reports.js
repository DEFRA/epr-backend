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
  getStatusHistoryDateTimes
} from '#common/helpers/dates/accreditation.js'
import { toCalendarDate } from '#common/helpers/date-formatter.js'
import {
  ACCREDITATION_STATUS,
  ACTIVE_ACCREDITATION_STATUSES
} from '#domain/organisations/model.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { AccreditationWindow } from '#common/helpers/dates/accreditation.js' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */

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
 * The day an accreditation was cancelled, read from its status history.
 *
 * @param {Accreditation} accreditation
 * @returns {CalendarDate | undefined}
 */
const dateCancelled = (accreditation) => {
  const cancellation = getStatusHistoryDateTimes(
    accreditation.statusHistory
  ).find((entry) => entry.status === ACCREDITATION_STATUS.CANCELLED)
  return cancellation && toCalendarDate(new Date(cancellation.updatedAt))
}

/**
 * An accreditation's validity window, cut short by its cancellation if any.
 *
 * @typedef {AccreditationWindow & { cancelledOn?: CalendarDate }} Obligation
 */

/**
 * The days an accreditation owed monthly reports for: its validity window,
 * cut short by a cancellation. A suspended accreditation keeps reporting. One
 * that is neither live nor cancelled owes nothing, whether it was never
 * granted or had its approval reverted.
 *
 * @param {Accreditation} accreditation
 * @returns {Obligation | null}
 */
const obligation = (accreditation) => {
  const window = accreditationWindow(accreditation)
  if (window === null) {
    return null
  }
  if (ACTIVE_ACCREDITATION_STATUSES.has(accreditation.status)) {
    return window
  }
  const cancelled = dateCancelled(accreditation)
  return cancelled === undefined ? null : { ...window, cancelledOn: cancelled }
}

/**
 * The monthly periods owed among the months served: those overlapping the
 * obligation. The caller has already settled which months have ended, on the
 * UK calendar, so no clock is consulted here.
 *
 * @param {Set<YearMonth>} served
 * @param {number[]} years
 * @param {Obligation} obligation
 */
const owedPeriods = (served, years, { validFrom, validTo, cancelledOn }) =>
  filterPeriodsFromDate(
    filterPeriodsFromDate(
      years.flatMap((year) => generateAllPeriodsForYear(CADENCE.monthly, year)),
      validFrom,
      validTo
    ),
    validFrom,
    cancelledOn
  ).filter((period) => served.has(toYearMonth(period.startDate)))

/**
 * Count, for each month served, the monthly reports that were required and
 * those submitted. Only an accredited registration reports monthly, so a
 * registered-only operator counts for nothing. A cancelled accreditation owed
 * every month up to its cancellation and none after, so it is counted for
 * those months and the reports it filed for them.
 *
 * @param {Object} params
 * @param {import('#domain/organisations/model.js').Organisation[]} params.organisations
 * @param {import('#reports/repository/port.js').PeriodicReport[]} params.periodicReports
 * @param {YearMonth[]} params.months - the reporting months served
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

  /** @type {Map<YearMonth, ReportCount>} */
  const counts = new Map(
    months.map((month) => [month, { expected: 0, submitted: 0 }])
  )
  for (const { org, registration } of getReportableRegistrations(
    organisations
  )) {
    const [accreditation] = accreditationsForRegistration(registration, org)
    const owes = accreditation && obligation(accreditation)
    if (!owes) {
      continue
    }
    const owed = owedPeriods(served, years, owes)
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
      const count = counts.get(month)
      if (count === undefined || !owedMonths.has(month)) {
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
  const total = { expected: 0, submitted: 0 }
  for (const { expected, submitted } of counts.values()) {
    total.expected += expected
    total.submitted += submitted
  }
  return { byMonth: Object.fromEntries(counts), total }
}
