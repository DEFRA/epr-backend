/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { RegistrationApproved } from '#domain/organisations/registration.js' */

import { CADENCE } from '#reports/domain/cadence.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import { mergeReportingPeriods } from '#reports/domain/merge-reporting-periods.js'
import { formatMaterial, capitalize } from '#common/helpers/formatters.js'
import { formatPeriodLabel } from '#reports/domain/period-labels.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'

/**
 * @typedef {Object} ReportSubmissionsRow
 * @property {string} organisationName
 * @property {string} submitterPhone
 * @property {string} approvedPersonsPhone
 * @property {string} submitterEmail
 * @property {string} approvedPersonsEmail
 * @property {string} material
 * @property {string} registrationNumber
 * @property {string} accreditationNumber
 * @property {string} reportType
 * @property {string} reportingPeriod
 * @property {string} dueDate
 * @property {string} submittedDate
 * @property {string} submittedBy
 */

/** @type {Set<string>} */
const INCLUDED_STATUSES = new Set([
  REG_ACC_STATUS.APPROVED,
  REG_ACC_STATUS.SUSPENDED
])

/**
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @returns {Promise<Array<{ org: Organisation, registration: RegistrationApproved }>>}
 */
async function getRegistrations(organisationsRepository) {
  const orgs = await organisationsRepository.findAll()
  return orgs.flatMap((org) =>
    org.registrations
      .filter((registration) => INCLUDED_STATUSES.has(registration.status))
      .map((registration) => ({
        org,
        registration: /** @type {RegistrationApproved} */ (registration)
      }))
  )
}

/**
 * @param {RegistrationApproved} registration
 * @param {Organisation} org
 * @returns {string}
 */
function resolveAccreditationNumber(registration, org) {
  if (!registration.accreditationId) return ''
  return /** @type {import('#domain/organisations/accreditation.js').AccreditationApproved} */ (
    org.accreditations.find((a) => a.id === registration.accreditationId)
  ).accreditationNumber
}

/**
 * @param {Organisation} org
 * @param {RegistrationApproved} registration
 * @param {string} cadence
 * @param {object} mergedPeriod
 * @param {string} accreditationNumber
 * @param {string} submittedDate
 * @param {string} submittedBy
 * @returns {ReportSubmissionsRow}
 */
function buildRow(
  org,
  registration,
  cadence,
  mergedPeriod,
  accreditationNumber,
  submittedDate,
  submittedBy
) {
  return {
    organisationName: org.companyDetails.name,
    submitterPhone: registration.submitterContactDetails.phone,
    approvedPersonsPhone: registration.approvedPersons
      .map((p) => p.phone)
      .join(', '),
    submitterEmail: registration.submitterContactDetails.email,
    approvedPersonsEmail: registration.approvedPersons
      .map((p) => p.email)
      .join(', '),
    material: formatMaterial(
      registration.material,
      registration.glassRecyclingProcess
    ),
    registrationNumber: registration.registrationNumber,
    accreditationNumber,
    reportType: capitalize(cadence),
    reportingPeriod: formatPeriodLabel(
      cadence,
      mergedPeriod.period,
      mergedPeriod.year
    ),
    dueDate: mergedPeriod.dueDate,
    submittedDate,
    submittedBy
  }
}

/**
 * Generates a flat list of report submission rows across all approved/suspended
 * registrations for all organisations.
 *
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @returns {Promise<{ reportSubmissions: ReportSubmissionsRow[], generatedAt: string }>}
 */
export async function generateReportSubmissions(
  organisationsRepository,
  reportsRepository
) {
  const currentYear = new Date().getUTCFullYear()
  /** @type {ReportSubmissionsRow[]} */
  const rows = []

  const allPeriodicReports = await reportsRepository.findAllPeriodicReports()
  /** @type {Map<string, import('#reports/repository/port.js').PeriodicReport[]>} */
  const reportsByKey = new Map(
    allPeriodicReports.map((pr) => [
      `${pr.organisationId}::${pr.registrationId}`,
      [pr]
    ])
  )

  for (const { org, registration } of await getRegistrations(
    organisationsRepository
  )) {
    const cadence = registration.accreditationId
      ? CADENCE.monthly
      : CADENCE.quarterly

    const computedPeriods = generateReportingPeriods(cadence, currentYear)
    const periodicReports =
      reportsByKey.get(`${org.id}::${registration.id}`) ?? []
    const merged = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      cadence
    )
    const accreditationNumber = resolveAccreditationNumber(registration, org)

    for (const mergedPeriod of merged) {
      const report = mergedPeriod.report
      rows.push(
        buildRow(
          org,
          registration,
          cadence,
          mergedPeriod,
          accreditationNumber,
          report?.submittedAt?.slice(0, 10) ?? '',
          report?.submittedBy?.name ?? ''
        )
      )
    }
  }

  return { reportSubmissions: rows, generatedAt: new Date().toISOString() }
}
