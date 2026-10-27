import { calendarDate } from '#common/helpers/date-formatter.js'
import { currentUtcYear } from '#common/helpers/dates/year.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { selectSubmittedReports } from '#reports/domain/merge-reporting-periods.js'
import { formatMaterial, capitalize } from '#common/helpers/formatters.js'
import { formatPeriodLabel } from '#reports/domain/period-labels.js'
import { REGULATOR_DISPLAY } from '#domain/organisations/model.js'
import { getReportableRegistrations } from '#domain/organisations/registration-utils.js'
import { reportingPeriodsByKind } from '#reports/application/report-calendar.js'
import { toReadModelRegistration } from '#organisation-read-model/repository/adapter.js'
import { logger } from '#common/helpers/logging/logger.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation, RegulatorDisplay } from '#domain/organisations/model.js' */
/** @import { ReportableRegistration } from '#domain/organisations/registration.js' */
/** @import { Registration as ReadModelRegistration } from '#organisation-read-model/domain/model.js' */
/** @import { Cadence } from '#reports/domain/cadence.js' */
/** @import { MergedPeriod } from '#reports/domain/merge-reporting-periods.js' */
/** @import { PeriodicReport, ReportSummary, ReportsRepository, WasteSentSummary } from '#reports/repository/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

/** @param {string} message */
const logDrop = (message) => logger.warn({ message })

/**
 * @typedef {Object} TonnageFields
 * @property {number | ''} tonnageReceivedForRecycling
 * @property {number | ''} tonnageRecycled
 * @property {number | ''} tonnageExportedForRecycling
 * @property {number | ''} tonnageSentOnTotal
 * @property {number | ''} tonnageSentOnToReprocessor
 * @property {number | ''} tonnageSentOnToExporter
 * @property {number | ''} tonnageSentOnToOtherFacilities
 * @property {number | ''} tonnagePrnsPernsIssued
 * @property {number | ''} freeTonnagePrnsPerns
 * @property {number | ''} totalRevenuePrnsPerns
 * @property {number | ''} averagePrnPernPricePerTonne
 * @property {number | ''} tonnageReceivedButNotRecycled
 * @property {number | ''} tonnageReceivedButNotExported
 * @property {number | ''} tonnageExportedThatWasStopped
 * @property {number | ''} tonnageExportedThatWasRefused
 * @property {number | ''} tonnageRepatriated
 * @property {string} noteToRegulator
 */

/**
 * @typedef {Object} SubmissionBaseFields
 * @property {RegulatorDisplay} regulator
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
 * @property {number | ''} submissionNumber
 */

/** @typedef {SubmissionBaseFields & TonnageFields} ReportSubmissionsRow */

/**
 * @param {number | null | undefined} value
 * @returns {number | ''}
 */
function formatTonnage(value) {
  return value !== null && value !== undefined ? value : ''
}

/**
 * @param {WasteSentSummary | undefined} wasteSent
 * @returns {number | ''}
 */
function sumSentOn(wasteSent) {
  if (!wasteSent) {
    return ''
  }
  return (
    wasteSent.tonnageSentToReprocessor +
    wasteSent.tonnageSentToExporter +
    wasteSent.tonnageSentToAnotherSite
  )
}

/**
 * @param {ReportSummary | null} report
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
    freeTonnagePrnsPerns: formatTonnage(report?.prn?.freeTonnage),
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
 * @param {ReportableRegistration} registration
 * @param {Cadence} cadence
 * @param {MergedPeriod} mergedPeriod
 * @param {string} accreditationNumber
 * @param {ReportSummary | null} report
 * @returns {ReportSubmissionsRow}
 */
function buildRow(
  org,
  registration,
  cadence,
  mergedPeriod,
  accreditationNumber,
  report
) {
  return {
    regulator: REGULATOR_DISPLAY[registration.submittedToRegulator],
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
    // Every report-derived field describes this one submitted report, so the
    // row stays internally consistent. An in-flight draft is never a `report`
    // here, so it produces no row until it is itself submitted.
    submittedDate: report?.submittedAt ? calendarDate(report.submittedAt) : '',
    submittedBy: report?.submittedBy?.name ?? '',
    submissionNumber: report?.submissionNumber ?? '',
    ...buildTonnageFields(report)
  }
}

async function buildSubmissionRows(
  organisationsRepository,
  currentYear,
  reportsByKey
) {
  const registrations = getReportableRegistrations(
    await organisationsRepository.findAll()
  )

  /** @type {ReportSubmissionsRow[]} */
  return registrations.flatMap(({ org, registration }) => {
    const readModel = toReadModelRegistration(org, registration, logDrop)
    if (!readModel) {
      return []
    }

    const periodicReports =
      reportsByKey.get(`${org.id}::${registration.id}`) ?? []
    const earlierYears = [
      ...new Set(
        periodicReports
          .map(({ year }) => year)
          .filter((year) => year < currentYear)
      )
    ]

    return [currentYear, ...earlierYears].flatMap((year) =>
      periodRows(org, registration, readModel, periodicReports, year, {
        storedOnly: year !== currentYear
      })
    )
  })
}

/**
 * @param {Organisation} org
 * @param {ReportableRegistration} registration
 * @param {ReadModelRegistration} readModel
 * @param {PeriodicReport[]} periodicReports
 * @param {Year} year
 * @param {{ storedOnly: boolean }} options
 * @returns {ReportSubmissionsRow[]}
 */
function periodRows(
  org,
  registration,
  readModel,
  periodicReports,
  year,
  { storedOnly }
) {
  const { registeredOnly, accredited, accreditationNumber } =
    reportingPeriodsByKind({
      registration: readModel,
      storedReports: periodicReports,
      year
    })
  const byCadence = /** @type {const} */ ([
    [CADENCE.quarterly, registeredOnly, ''],
    [CADENCE.monthly, accredited, accreditationNumber ?? '']
  ])

  return byCadence.flatMap(([cadence, merged, number]) =>
    merged
      .filter((mergedPeriod) => !storedOnly || mergedPeriod.report)
      .flatMap((mergedPeriod) => {
        // One row per submitted report, so a resubmitted period fans out. A
        // period with nothing submitted still gets a single blank row (`null`),
        // keeping outstanding periods visible. The feed is the only consumer of
        // this projection, so it derives it here rather than the merge stamping
        // it onto every period for the calendar path to strip straight back off.
        const submitted = selectSubmittedReports({
          current: mergedPeriod.report,
          previousSubmissions: mergedPeriod.previousSubmissions
        })
        const reports = submitted.length ? submitted : [null]
        return reports.map((report) =>
          buildRow(org, registration, cadence, mergedPeriod, number, report)
        )
      })
  )
}

/**
 * Generates a flat list of report submission rows across all approved/cancelled
 * registrations for all organisations.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {ReportsRepository} reportsRepository
 * @returns {Promise<{ reportSubmissions: ReportSubmissionsRow[], generatedAt: string }>}
 */
export async function generateReportSubmissions(
  organisationsRepository,
  reportsRepository
) {
  const currentYear = currentUtcYear()

  const allPeriodicReports = await reportsRepository.findAllPeriodicReports()
  /** @type {Map<string, PeriodicReport[]>} */
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
