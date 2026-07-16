import { CADENCE } from '#reports/domain/cadence.js'
import { periodKey } from '#reports/domain/period-key.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import {
  mergeReportingPeriods,
  selectSubmittedReports
} from '#reports/domain/merge-reporting-periods.js'
import { generateComplianceReportingPeriods } from '#reports/domain/compliance-reporting-periods.js'
import {
  activeAccreditationValidFrom,
  getReportableRegistrations,
  resolveAccreditation,
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
 * @returns {string | null}
 */
function originalSubmittedDate(mergedPeriod) {
  const [original] = selectSubmittedReports({
    current: mergedPeriod.report,
    previousSubmissions: mergedPeriod.previousSubmissions
  })
  return original?.submittedAt?.slice(0, 10) ?? null
}

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

    // An accredited operator owes monthly reports only from the date their
    // accreditation began, so bound obligations to validFrom (matches the
    // operator calendar and the admin export).
    const validFrom = activeAccreditationValidFrom(
      resolveAccreditation(registration, org)
    )

    const periodicReports =
      reportsByRegistration.get(`${org.id}::${registration.id}`) ?? []

    /** @type {Map<string, string | null>} */
    const submittedDates = new Map()

    for (const year of years) {
      const computedPeriods = generateReportingPeriods(
        cadence,
        year,
        now,
        validFrom
      )
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
          originalSubmittedDate(mergedPeriod)
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
