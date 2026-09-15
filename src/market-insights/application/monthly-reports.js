import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import {
  mergeReportingPeriods,
  selectSubmittedReports
} from '#reports/domain/merge-reporting-periods.js'
import { groupByRegistration } from '#reports/application/report-compliance.js'
import {
  activeAccreditationValidFrom,
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
 * Count the monthly reports owed for the months served and those submitted.
 * Only an accredited registration reports monthly and only an accredited
 * partition is published, so a registered-only operator counts for nothing.
 * Obligations start with the accreditation, as the public register has them.
 *
 * @param {Object} params
 * @param {import('#domain/organisations/model.js').Organisation[]} params.organisations
 * @param {import('#reports/repository/port.js').PeriodicReport[]} params.periodicReports
 * @param {string[]} params.months - the `YYYY-MM` reporting months served
 * @param {Date} params.now
 * @returns {MonthlyReportCount}
 */
export const countMonthlyReports = ({
  organisations,
  periodicReports,
  months,
  now
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
    const validFrom = activeAccreditationValidFrom(accreditation)
    const reports =
      reportsByRegistration.get(`${org.id}::${registration.id}`) ?? []

    for (const year of years) {
      const owed = generateReportingPeriods(
        CADENCE.monthly,
        year,
        now,
        validFrom
      ).filter((period) => served.has(toYearMonth(period.startDate)))
      const owedMonths = new Set(owed.map((p) => toYearMonth(p.startDate)))

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
  }
  return count
}
