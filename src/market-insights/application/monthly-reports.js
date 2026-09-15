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
 * How complete the figures are: the monthly reports owed across the months
 * served, and how many of them have been submitted.
 *
 * @typedef {Object} MonthlyReportCount
 * @property {number} expected
 * @property {number} submitted
 */

/**
 * The monthly periods an accreditation owes among the months served. The
 * caller has already settled which months have ended, on the UK calendar, so
 * no clock is consulted here.
 *
 * @param {Set<string>} served - `YYYY-MM` keys
 * @param {number[]} years
 * @param {string} validFrom
 */
const owedPeriods = (served, years, validFrom) =>
  filterPeriodsFromDate(
    years.flatMap((year) => generateAllPeriodsForYear(CADENCE.monthly, year)),
    validFrom
  ).filter((period) => served.has(toYearMonth(period.startDate)))

/**
 * Count the monthly reports owed for the months served and those submitted.
 * Only an accredited registration reports monthly and only an accredited
 * partition is published, so a registered-only operator counts for nothing.
 * Obligations start with the accreditation, as the public register has them.
 *
 * @param {Object} params
 * @param {import('#domain/organisations/model.js').Organisation[]} params.organisations
 * @param {import('#reports/repository/port.js').PeriodicReport[]} params.periodicReports
 * @param {string[]} params.months - the `YYYY-MM` reporting months served
 * @returns {MonthlyReportCount}
 */
export const countMonthlyReports = ({
  organisations,
  periodicReports,
  months
}) => {
  const served = new Set(months)
  const years = [...new Set(months.map((month) => Number(month.slice(0, 4))))]
  const reportsByRegistration = groupByRegistration(periodicReports)

  const count = { expected: 0, submitted: 0 }
  for (const { org, registration } of getReportableRegistrations(
    organisations
  )) {
    const accreditation = resolveAccreditation(registration, org)
    if (accreditation === null) {
      continue
    }
    const owed = owedPeriods(served, years, accreditation.validFrom)
    const owedMonths = new Set(owed.map((p) => toYearMonth(p.startDate)))
    const reports =
      reportsByRegistration.get(`${org.id}::${registration.id}`) ?? []

    for (const period of mergeReportingPeriods(
      owed,
      reports,
      CADENCE.monthly
    )) {
      if (!owedMonths.has(toYearMonth(period.startDate))) {
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
  return count
}
