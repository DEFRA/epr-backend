import { calendarDate } from '#common/helpers/date-formatter.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { periodKey } from '#reports/domain/period-key.js'
import { registrationKey } from '#reports/domain/registration-key.js'
import { selectSubmittedReports } from '#reports/domain/merge-reporting-periods.js'
import { generateComplianceReportingPeriods } from '#reports/domain/compliance-reporting-periods.js'
import { reportingPeriodsByKind } from '#reports/application/report-calendar.js'
import { reportableRegistrations } from '#reports/application/reportable-registrations.js'

/**
 * @import { CalendarDate } from '#common/helpers/date-formatter.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { Organisation, Registration } from '#organisation-read-model/domain/model.js'
 */

/**
 * @typedef {import('#reports/domain/compliance-reporting-periods.js').CompliancePeriod} CompliancePeriod
 */

/**
 * @typedef {{
 *   submittedDates: Map<string, string | null>;
 * }} ReportComplianceEntry
 */

/**
 * @typedef {{
 *   periods: CompliancePeriod[];
 *   entries: Map<string, ReportComplianceEntry>;
 * }} ReportComplianceData
 */

/**
 * The date the public register shows for a period. It retains the ORIGINAL
 * submitted date: resubmissions are not reflected externally.
 *
 * `selectSubmittedReports` returns the period's submitted reports ordered by
 * submissionNumber ascending, so its first entry is the lowest-numbered
 * submission. That is the original submission, because the write model only
 * permits unsubmitting the latest submission (`isLatestSubmission` in
 * report-service.js), so an earlier submission's `submittedAt` is never
 * re-stamped after a later one exists. Keying on a retained `submittedAt`
 * rather than the current status means a submitted-then-unsubmitted period
 * keeps its date instead of blanking. A period with nothing submitted yields
 * no entry, so resolves to null (never the in-flight draft in `report`, nor a
 * later correction).
 *
 * @param {import('#reports/domain/merge-reporting-periods.js').MergedPeriod} mergedPeriod
 * @returns {CalendarDate | null}
 */
function originalSubmittedDate(mergedPeriod) {
  const [original] = selectSubmittedReports({
    current: mergedPeriod.report,
    previousSubmissions: mergedPeriod.previousSubmissions
  })
  return original?.submittedAt ? calendarDate(original.submittedAt) : null
}

/**
 * Groups all periodic reports by their registration's numbers.
 *
 * @param {import('#reports/repository/port.js').PeriodicReport[]} allPeriodicReports
 * @returns {Map<string, import('#reports/repository/port.js').PeriodicReport[]>}
 */
export function groupByRegistration(allPeriodicReports) {
  return allPeriodicReports.reduce((map, pr) => {
    const key = registrationKey(pr)
    const existing = map.get(key) ?? []
    return map.set(key, [...existing, pr])
  }, new Map())
}

/**
 * Builds a map of report compliance data for every registration of the
 * organisations, as the read model serves them, outside test organisations.
 *
 * Each entry in `entries` is keyed by the registration's organisation and
 * registration numbers (see `registrationKey`). Its `submittedDates` has a key,
 * `${year}:${cadence}:${period}`, for each ended period the registration has a
 * reporting obligation for, as the year calendar lists them, holding the
 * original submitted date or null. An absent key is "N/A".
 *
 * @param {Organisation[]} organisations
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {Date} [now]
 * @returns {Promise<ReportComplianceData>}
 */
export async function generateReportCompliance(
  organisations,
  reportsRepository,
  now = new Date()
) {
  const periods = generateComplianceReportingPeriods()
  const years = [...new Set(periods.map((p) => p.year))]

  const allPeriodicReports = await reportsRepository.findAllPeriodicReports()
  const reportsByRegistration = groupByRegistration(allPeriodicReports)

  /** @type {Map<string, ReportComplianceEntry>} */
  const entries = new Map(
    reportableRegistrations(organisations).map(({ registration, key }) => [
      key,
      {
        submittedDates: submittedDatesFor({
          registration,
          storedReports: reportsByRegistration.get(key) ?? [],
          years,
          now
        })
      }
    ])
  )

  return { periods, entries }
}

/**
 * @param {{
 *   registration: Registration,
 *   storedReports: import('#reports/repository/port.js').PeriodicReport[],
 *   years: Year[],
 *   now: Date
 * }} params
 * @returns {Map<string, string | null>}
 */
function submittedDatesFor({ registration, storedReports, years, now }) {
  /** @type {Map<string, string | null>} */
  const submittedDates = new Map()

  for (const year of years) {
    const { registeredOnly, accredited } = reportingPeriodsByKind({
      registration,
      storedReports,
      year,
      now
    })
    const byCadence = /** @type {const} */ ([
      [CADENCE.quarterly, registeredOnly],
      [CADENCE.monthly, accredited]
    ])

    for (const [cadence, merged] of byCadence) {
      for (const mergedPeriod of merged) {
        submittedDates.set(
          periodKey({ year, cadence, period: mergedPeriod.period }),
          originalSubmittedDate(mergedPeriod)
        )
      }
    }
  }

  return submittedDates
}
