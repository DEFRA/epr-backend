import { resolveDetailedMaterial } from '#domain/organisations/registration-utils.js'
import { getOrsDetailsMap } from '#overseas-sites/application/get-ors-details-map.js'
import { getIssuedTonnage } from '#packaging-recycling-notes/application/get-issued-tonnage.js'
import { latestSubmittedSummaryLog } from '#waste-balances/application/latest-submitted-summary-log.js'
import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'
import { aggregateReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
import {
  assertNoExistingReport,
  assertResubmissionAllowed,
  getValidatedPeriodInfo
} from './create-report-validation.js'
import { canRequestResubmission } from './resubmission-service.js'
import { findReportIdBySubmissionNumber } from './submission-lookup.js'

/**
 * @import { Registration, RegistrationAddress } from '#domain/organisations/registration.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { AggregatedReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { PeriodicReport } from '#reports/repository/port.js'
 */

/**
 * Application-layer facade over the reports repository for cross-module reads.
 * Consumers outside the reports module (for example summary-logs) depend on this
 * service rather than the repository port directly. See PAE-1686.
 *
 * @typedef {object} ReportsService
 * @property {(organisationId: string, registrationId: string, since: string) => Promise<boolean>} hasReportSubmittedSince
 * @property {(params: import('#reports/repository/port.js').FindPeriodicReportsParams) => Promise<PeriodicReport[]>} findPeriodicReports
 */

/**
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @returns {ReportsService}
 */
export const createReportsService = (reportsRepository) => ({
  hasReportSubmittedSince: (organisationId, registrationId, since) =>
    reportsRepository.hasReportSubmittedSince(
      organisationId,
      registrationId,
      since
    ),

  findPeriodicReports: (params) => reportsRepository.findPeriodicReports(params)
})

/**
 * Looks up a stored report for a specific period and submission number.
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {Promise<import('#reports/repository/port.js').Report | null>}
 */
export async function fetchReportBySubmissionNumber(
  reportsRepository,
  organisationId,
  registrationId,
  year,
  cadence,
  period,
  submissionNumber
) {
  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationId,
    registrationId
  })

  const currentReportId = findReportIdBySubmissionNumber(
    periodicReports,
    year,
    cadence,
    period,
    submissionNumber
  )

  if (!currentReportId) {
    return null
  }

  return reportsRepository.findReportById(currentReportId)
}

/**
 * Formats a site address object into a single-line string.
 * @param {RegistrationAddress|undefined} address
 * @returns {string|undefined}
 */
function formatSiteAddress(address) {
  if (!address) {
    return undefined
  }
  return [address.line1, address.line2, address.town, address.postcode]
    .filter(Boolean)
    .join(', ')
}

/**
 * @typedef {Pick<AggregatedReportDetail, 'source' | 'recyclingActivity' | 'exportActivity' | 'wasteSent'> & {
 *   material: string,
 *   wasteProcessingType: string,
 *   siteAddress: string | undefined,
 *   prn: { issuedTonnage: number } | null | undefined
 * }} ReportData
 */

/**
 * Extracts the report-specific fields from aggregated data and registration.
 * @param {AggregatedReportDetail & { prn?: { issuedTonnage: number } | null }} aggregated
 * @param {Registration} registration
 * @returns {ReportData}
 */
function buildReportData(aggregated, registration) {
  const { recyclingActivity, exportActivity, wasteSent, prn, source } =
    aggregated
  return {
    material: resolveDetailedMaterial(registration),
    wasteProcessingType: registration.wasteProcessingType,
    siteAddress: formatSiteAddress(registration.site?.address),
    source,
    recyclingActivity,
    prn,
    ...(exportActivity && { exportActivity }),
    wasteSent
  }
}

/**
 * Finds the report for a given period with PRN tonnage. Returns the stored
 * report if one exists, otherwise computes one from waste records.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} params.summaryLogRowStateRepository
 * @param {PackagingRecyclingNotesRepository} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {Registration} params.registration
 * @param {number} params.year
 * @param {Cadence} params.cadence
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @returns {Promise<(import('#reports/repository/port.js').Report | import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail) & { canRequestResubmission: boolean }>}
 */
export async function fetchOrGenerateReportForPeriod({
  reportsRepository,
  ledgerRepository,
  summaryLogRowStateRepository,
  packagingRecyclingNotesRepository,
  overseasSitesRepository,
  organisationId,
  registrationId,
  registration,
  year,
  cadence,
  period,
  submissionNumber
}) {
  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationId,
    registrationId
  })

  const currentReportId = findReportIdBySubmissionNumber(
    periodicReports,
    year,
    cadence,
    period,
    submissionNumber
  )

  const storedReport = currentReportId
    ? await reportsRepository.findReportById(currentReportId)
    : null

  if (storedReport) {
    return {
      ...storedReport,
      canRequestResubmission: canRequestResubmission(periodicReports, {
        status: storedReport.status.currentStatus,
        resubmissionRequired: storedReport.resubmissionRequired,
        year: storedReport.year,
        cadence: /** @type {Cadence} */ (storedReport.cadence),
        period: storedReport.period,
        submissionNumber: storedReport.submissionNumber
      })
    }
  }

  const operatorCategory = getOperatorCategory(registration)

  const aggregatedReportDetail = await getAggregatedReportDetail({
    ledgerRepository,
    summaryLogRowStateRepository,
    packagingRecyclingNotesRepository,
    overseasSitesRepository,
    operatorCategory,
    organisationId,
    registrationId,
    registration,
    year,
    cadence,
    period
  })

  return { ...aggregatedReportDetail, canRequestResubmission: false }
}

/**
 * The report source — which submission produced the current state, and when
 * it was submitted. A ledger with no submission yet has a null source.
 *
 * @param {{ summaryLogId: string, submittedAt: Date } | null} latestSubmission
 * @returns {{ summaryLogId: string|null, lastUploadedAt: string|null }}
 */
function toSource(latestSubmission) {
  return latestSubmission === null
    ? { summaryLogId: null, lastUploadedAt: null }
    : {
        summaryLogId: latestSubmission.summaryLogId,
        lastUploadedAt: latestSubmission.submittedAt.toISOString()
      }
}

/**
 * Aggregates a registration's waste-record states at its latest submitted
 * summary log into a report and appends issued PRN tonnage.
 * @param {object} params
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} params.summaryLogRowStateRepository
 * @param {PackagingRecyclingNotesRepository} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
 * @param {string} params.operatorCategory
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {Registration} params.registration
 * @param {number} params.year
 * @param {Cadence} params.cadence
 * @param {number} params.period
 * @returns {Promise<import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail & { prn: { issuedTonnage: number } | null }>}
 */
async function getAggregatedReportDetail({
  ledgerRepository,
  summaryLogRowStateRepository,
  packagingRecyclingNotesRepository,
  overseasSitesRepository,
  operatorCategory,
  organisationId,
  registrationId,
  registration,
  year,
  cadence,
  period
}) {
  const accreditationId = registration.accreditationId ?? null
  const ledgerId = { organisationId, registrationId, accreditationId }

  // One head resolution serves both reads: the row states and the source
  // metadata must describe the same submission, so a submission committing
  // mid-read cannot skew them apart.
  const latestSubmission = await latestSubmittedSummaryLog(
    ledgerRepository,
    ledgerId
  )

  const wasteRecordStates = await wasteRecordStatesForHead(
    summaryLogRowStateRepository,
    ledgerId,
    latestSubmission === null ? null : latestSubmission.summaryLogId
  )

  const source = toSource(latestSubmission)

  const orsDetailsMap = await getOrsDetailsMap(
    overseasSitesRepository,
    registration.overseasSites
  )

  const aggregatedReportDetail = aggregateReportDetail(wasteRecordStates, {
    operatorCategory,
    cadence,
    year,
    period,
    source,
    orsDetailsMap
  })

  const prn = await getIssuedTonnage(packagingRecyclingNotesRepository, {
    organisationId,
    registrationId,
    accreditationId: registration.accreditationId,
    startDate: aggregatedReportDetail.startDate,
    endDate: aggregatedReportDetail.endDate
  })

  return { ...aggregatedReportDetail, prn }
}

/**
 * Creates a report for a given period. Validates the period has ended,
 * checks no report already exists, aggregates waste data, and persists.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} params.summaryLogRowStateRepository
 * @param {PackagingRecyclingNotesRepository} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {Registration} params.registration
 * @param {number} params.year
 * @param {Cadence} params.cadence
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @param {import('#reports/repository/port.js').UserSummary} params.changedBy
 * @returns {Promise<import('#reports/repository/port.js').Report>}
 */
export async function createReportForPeriod({
  reportsRepository,
  ledgerRepository,
  summaryLogRowStateRepository,
  packagingRecyclingNotesRepository,
  overseasSitesRepository,
  organisationId,
  registrationId,
  registration,
  year,
  cadence,
  period,
  submissionNumber,
  changedBy
}) {
  const { startDate, endDate, dueDate } = getValidatedPeriodInfo(
    cadence,
    year,
    period
  )

  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationId,
    registrationId
  })

  // Existence is the more fundamental precondition: a duplicate submission is
  // reported as such regardless of whether a fresh create would have been
  // permitted, so the duplicate check runs before the resubmission gate.
  assertNoExistingReport(
    periodicReports,
    year,
    cadence,
    period,
    submissionNumber
  )

  assertResubmissionAllowed(
    periodicReports,
    year,
    cadence,
    period,
    submissionNumber
  )

  const operatorCategory = getOperatorCategory(registration)

  const aggregatedReportData = await getAggregatedReportDetail({
    ledgerRepository,
    summaryLogRowStateRepository,
    packagingRecyclingNotesRepository,
    overseasSitesRepository,
    operatorCategory,
    organisationId,
    registrationId,
    registration,
    year,
    cadence,
    period
  })

  return reportsRepository.createReport({
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    startDate,
    endDate,
    dueDate,
    submissionNumber,
    changedBy,
    ...buildReportData(aggregatedReportData, registration)
  })
}
