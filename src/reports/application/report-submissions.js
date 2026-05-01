/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { RegistrationApproved } from '#domain/organisations/registration.js' */

import { CADENCE } from '#reports/domain/cadence.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import { mergeReportingPeriods } from '#reports/domain/merge-reporting-periods.js'
import {
  formatMaterial,
  capitalize,
  uppercaseString
} from '#common/helpers/formatters.js'
import { formatPeriodLabel } from '#reports/domain/period-labels.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

/**
 * @typedef {Object} TonnageFields
 * @property {string} tonnageReceivedForRecycling
 * @property {string} tonnageRecycled
 * @property {string} tonnageExportedForRecycling
 * @property {string} tonnageSentOnTotal
 * @property {string} tonnageSentOnToReprocessor
 * @property {string} tonnageSentOnToExporter
 * @property {string} tonnageSentOnToOtherFacilities
 * @property {string} tonnagePrnsPernsIssued
 * @property {string} totalRevenuePrnsPerns
 * @property {string} averagePrnPernPricePerTonne
 * @property {string} tonnageReceivedButNotRecycled
 * @property {string} tonnageReceivedButNotExported
 * @property {string} tonnageExportedThatWasStopped
 * @property {string} tonnageExportedThatWasRefused
 * @property {string} tonnageRepatriated
 * @property {string} noteToRegulator
 */

/**
 * @typedef {Object} SubmissionBaseFields
 * @property {string} regulator
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

/** @typedef {SubmissionBaseFields & TonnageFields} ReportSubmissionsRow */

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
  return orgs
    .filter((org) => !TEST_ORGANISATIONS.has(org.orgId))
    .flatMap((org) =>
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
/**
 * @param {number | null | undefined} value
 * @returns {string}
 */
function formatTonnage(value) {
  return value !== null && value !== undefined ? String(value) : ''
}

/**
 * @param {import('#reports/repository/port.js').WasteSent | undefined} wasteSent
 * @returns {string}
 */
function sumSentOn(wasteSent) {
  if (!wasteSent) {
    return ''
  }
  return String(
    wasteSent.tonnageSentToReprocessor +
      wasteSent.tonnageSentToExporter +
      wasteSent.tonnageSentToAnotherSite
  )
}

function resolveAccreditationNumber(registration, org) {
  if (!registration.accreditationId) {
    return ''
  }
  const accreditation = org.accreditations.find(
    (a) =>
      a.id === registration.accreditationId && INCLUDED_STATUSES.has(a.status)
  )
  return accreditation?.accreditationNumber ?? ''
}

/**
 * @param {import('#reports/repository/port.js').ReportSummary | null} report
 * @returns {TonnageFields}
 */
function buildTonnageFields(report) {
  return {
    tonnageReceivedForRecycling: formatTonnage(
      report?.recyclingActivity?.totalTonnageReceived
    ),
    tonnageRecycled: formatTonnage(report?.recyclingActivity?.tonnageRecycled),
    tonnageExportedForRecycling: formatTonnage(
      report?.exportActivity?.totalTonnageExported
    ),
    tonnageSentOnTotal: sumSentOn(report?.wasteSent),
    tonnageSentOnToReprocessor: formatTonnage(
      report?.wasteSent?.tonnageSentToReprocessor
    ),
    tonnageSentOnToExporter: formatTonnage(
      report?.wasteSent?.tonnageSentToExporter
    ),
    tonnageSentOnToOtherFacilities: formatTonnage(
      report?.wasteSent?.tonnageSentToAnotherSite
    ),
    tonnagePrnsPernsIssued: formatTonnage(report?.prn?.issuedTonnage),
    totalRevenuePrnsPerns: formatTonnage(report?.prn?.totalRevenue),
    averagePrnPernPricePerTonne: formatTonnage(
      report?.prn?.averagePricePerTonne
    ),
    tonnageReceivedButNotRecycled: formatTonnage(
      report?.recyclingActivity?.tonnageNotRecycled
    ),
    tonnageReceivedButNotExported: formatTonnage(
      report?.exportActivity?.tonnageReceivedNotExported
    ),
    tonnageExportedThatWasStopped: formatTonnage(
      report?.exportActivity?.tonnageStoppedDuringExport
    ),
    tonnageExportedThatWasRefused: formatTonnage(
      report?.exportActivity?.tonnageRefusedAtDestination
    ),
    tonnageRepatriated: formatTonnage(
      report?.exportActivity?.tonnageRepatriated
    ),
    noteToRegulator: report?.supportingInformation ?? ''
  }
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
    regulator: uppercaseString(registration.submittedToRegulator),
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
    submittedBy,
    ...buildTonnageFields(mergedPeriod.report)
  }
}

async function buildSubmissionRows(
  organisationsRepository,
  currentYear,
  reportsByKey
) {
  const registrations = await getRegistrations(organisationsRepository)

  /** @type {ReportSubmissionsRow[]} */
  return registrations.flatMap(({ org, registration }) => {
    const accreditationNumber = resolveAccreditationNumber(registration, org)
    const cadence = accreditationNumber ? CADENCE.monthly : CADENCE.quarterly

    const computedPeriods = generateReportingPeriods(cadence, currentYear)
    const periodicReports =
      reportsByKey.get(`${org.id}::${registration.id}`) ?? []
    const merged = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      cadence
    )

    return merged.map((mergedPeriod) => {
      const report = mergedPeriod.report
      return buildRow(
        org,
        registration,
        cadence,
        mergedPeriod,
        accreditationNumber,
        report?.submittedAt?.slice(0, 10) ?? '',
        report?.submittedBy?.name ?? ''
      )
    })
  })
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

  const allPeriodicReports = await reportsRepository.findAllPeriodicReports()
  /** @type {Map<string, import('#reports/repository/port.js').PeriodicReport[]>} */
  const reportsByRegistration = allPeriodicReports.reduce((map, pr) => {
    const key = `${pr.organisationId}::${pr.registrationId}`
    const existing = map.get(key) ?? []
    return map.set(key, [...existing, pr])
  }, new Map())

  const rows = await buildSubmissionRows(
    organisationsRepository,
    currentYear,
    reportsByRegistration
  )
  return { reportSubmissions: rows, generatedAt: new Date().toISOString() }
}
