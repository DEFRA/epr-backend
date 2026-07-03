import { CADENCE } from '#reports/domain/cadence.js'
import { periodKey } from '#reports/domain/period-key.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import { mergeReportingPeriods } from '#reports/domain/merge-reporting-periods.js'
import { generateComplianceReportingPeriods } from '#reports/domain/compliance-reporting-periods.js'
import {
  getReportableRegistrations,
  resolveAccreditationNumber
} from '#domain/organisations/registration-utils.js'

/**
 * @typedef {import('#reports/domain/compliance-reporting-periods.js').CompliancePeriod} CompliancePeriod
 */

/**
 * @typedef {{
 *   registrationId: string;
 *   organisationId: string;
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
 * Groups all periodic reports by `${organisationId}::${registrationId}`.
 *
 * @param {import('#reports/repository/port.js').PeriodicReport[]} allPeriodicReports
 * @returns {Map<string, import('#reports/repository/port.js').PeriodicReport[]>}
 */
function groupByRegistration(allPeriodicReports) {
  return allPeriodicReports.reduce((map, pr) => {
    const key = `${pr.organisationId}::${pr.registrationId}`
    const existing = map.get(key) ?? []
    return map.set(key, [...existing, pr])
  }, new Map())
}

/**
 * Builds a map of report compliance data for all approved/suspended registrations.
 *
 * Each entry in `entries` is keyed by `registrationId` and contains only the
 * periods that were actually submitted (`submittedDates`). The consumer can
 * determine whether an absent key represents "not yet submitted" or "N/A" by
 * comparing the compliance period's cadence against the registration's cadence
 * (encoded in the key as `${year}:${cadence}:${period}`).
 *
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {Date} [now]
 * @returns {Promise<ReportComplianceData>}
 */
export async function generateReportCompliance(
  organisationsRepository,
  reportsRepository,
  now = new Date()
) {
  const periods = generateComplianceReportingPeriods()
  const years = [...new Set(periods.map((p) => p.year))]

  const orgs = await organisationsRepository.findAll()
  const registrations = getReportableRegistrations(orgs)

  const allPeriodicReports = await reportsRepository.findAllPeriodicReports()
  const reportsByRegistration = groupByRegistration(allPeriodicReports)

  /** @type {Map<string, ReportComplianceEntry>} */
  const entries = new Map()

  for (const { org, registration } of registrations) {
    const accreditationNumber = resolveAccreditationNumber(registration, org)
    const cadence = accreditationNumber ? CADENCE.monthly : CADENCE.quarterly

    const periodicReports =
      reportsByRegistration.get(`${org.id}::${registration.id}`) ?? []

    /** @type {Map<string, string | null>} */
    const submittedDates = new Map()

    for (const year of years) {
      const computedPeriods = generateReportingPeriods(cadence, year, now)
      const merged = mergeReportingPeriods(
        computedPeriods,
        periodicReports,
        cadence
      )

      for (const mergedPeriod of merged) {
        submittedDates.set(
          periodKey({
            year: mergedPeriod.year,
            cadence,
            period: mergedPeriod.period
          }),
          mergedPeriod.report?.submittedAt?.slice(0, 10) ?? null
        )
      }
    }

    entries.set(registration.id, {
      registrationId: registration.id,
      organisationId: org.id,
      submittedDates
    })
  }

  return { periods, entries }
}
