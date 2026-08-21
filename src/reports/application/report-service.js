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
import {
  assertReportDataComplete,
  summariseIncompleteData
} from './report-mandatory/assert-report-data-complete.js'

/**
 * @import { Registration, RegistrationAddress } from '#domain/organisations/registration.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { AggregatedReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { OperatorCategory } from '#reports/domain/operator-category.js'
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
 * Wraps a stored report with its `canRequestResubmission` flag for the
 * fetch-or-generate result. The completeness signal is a preview-only concern,
 * so the stored branch never carries it.
 *
 * @param {import('#reports/repository/port.js').Report} storedReport
 * @param {PeriodicReport[]} periodicReports
 * @returns {import('#reports/repository/port.js').Report & { canRequestResubmission: boolean }}
 */
function buildStoredReportResult(storedReport, periodicReports) {
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

/**
 * Finds the report for a given period with PRN tonnage. Returns the stored
 * report if one exists, otherwise computes one from waste records.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {PackagingRecyclingNotesRepository} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {Registration} params.registration
 * @param {number} params.year
 * @param {Cadence} params.cadence
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.featureFlags]
 * @returns {Promise<(import('#reports/repository/port.js').Report | import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail) & { canRequestResubmission: boolean, incompleteSummaryLogRows?: { total: number, issues: import('./report-mandatory/assert-report-data-complete.js').Issue[] } }>}
 */
export async function fetchOrGenerateReportForPeriod({
  reportsRepository,
  ledgerRepository,
  summaryLogRowStatesRepository,
  packagingRecyclingNotesRepository,
  overseasSitesRepository,
  organisationId,
  registrationId,
  registration,
  year,
  cadence,
  period,
  submissionNumber,
  featureFlags
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
    return buildStoredReportResult(storedReport, periodicReports)
  }

  const operatorCategory = getOperatorCategory(registration)

  const { latestSubmission, wasteRecordStates } = await readSubmissionRowStates(
    {
      ledgerRepository,
      summaryLogRowStatesRepository,
      organisationId,
      registrationId,
      registration
    }
  )

  const aggregatedReportDetail = await getAggregatedReportDetail({
    packagingRecyclingNotesRepository,
    overseasSitesRepository,
    operatorCategory,
    organisationId,
    registrationId,
    registration,
    year,
    cadence,
    period,
    wasteRecordStates,
    latestSubmission
  })

  // Attached on every generate-branch preview (any period without a stored
  // report), not only Due/Over Due ones: a not-yet-ended period resolves to a
  // null period status yet still generates. The frontend gates the
  // validation-error screen on Due/Over Due, so this signal is broader than the
  // screen by design (PAE-1420).
  const incompleteSummaryLogRows = summariseIncompleteDataIfEnabled(
    featureFlags,
    wasteRecordStates
  )

  return {
    ...aggregatedReportDetail,
    canRequestResubmission: false,
    ...(incompleteSummaryLogRows && { incompleteSummaryLogRows })
  }
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
 * Reads a registration's waste-record states at its latest submitted summary
 * log, in one head resolution so the row states and their submission metadata
 * describe the same submission — a submission committing mid-read cannot skew
 * them apart. Callers pass the result to the completeness gate and the
 * aggregation so both see identical data.
 *
 * @param {object} params
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {Registration} params.registration
 */
async function readSubmissionRowStates({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationId,
  registrationId,
  registration
}) {
  const accreditationId = registration.accreditationId ?? null
  const ledgerId = { organisationId, registrationId, accreditationId }

  const latestSubmission = await latestSubmittedSummaryLog(
    ledgerRepository,
    ledgerId
  )
  const wasteRecordStates = await wasteRecordStatesForHead(
    summaryLogRowStatesRepository,
    ledgerId,
    latestSubmission === null ? null : latestSubmission.summaryLogId
  )

  return { latestSubmission, wasteRecordStates }
}

/**
 * Aggregates a registration's waste-record states at its latest submitted
 * summary log into a report and appends issued PRN tonnage. The row states and
 * their submission metadata are read once by the caller and passed in, so the
 * completeness gate and this aggregation describe the same submission.
 * @param {object} params
 * @param {PackagingRecyclingNotesRepository} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
 * @param {OperatorCategory} params.operatorCategory
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {Registration} params.registration
 * @param {number} params.year
 * @param {Cadence} params.cadence
 * @param {number} params.period
 * @param {import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState[]} params.wasteRecordStates
 * @param {Awaited<ReturnType<typeof latestSubmittedSummaryLog>>} params.latestSubmission
 * @returns {Promise<import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail & { prn: { issuedTonnage: number } | null }>}
 */
async function getAggregatedReportDetail({
  packagingRecyclingNotesRepository,
  overseasSitesRepository,
  operatorCategory,
  organisationId,
  registrationId,
  registration,
  year,
  cadence,
  period,
  wasteRecordStates,
  latestSubmission
}) {
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
 * Asserts a report can be created for the period. Loads the registration's
 * periodic reports and rejects a duplicate submission before a disallowed
 * resubmission: existence is the more fundamental precondition, so a duplicate
 * is reported as such regardless of whether a fresh create would have been
 * permitted.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {number} params.year
 * @param {Cadence} params.cadence
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @returns {Promise<void>}
 */
async function assertReportCreationAllowed({
  reportsRepository,
  organisationId,
  registrationId,
  year,
  cadence,
  period,
  submissionNumber
}) {
  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationId,
    registrationId
  })

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
}

/**
 * Runs the report-data completeness gate when the feature flag is on. The gate
 * checks every row in the summary log, not just the rows this report
 * aggregates, so an incomplete row from any period blocks creation; its per-row
 * policy lookup skips any processing type without rules, so the feature flag is
 * the only guard needed here.
 *
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags | undefined} featureFlags
 * @param {import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState[]} wasteRecordStates
 * @param {string} reference
 * @returns {void}
 */
function assertReportDataCompleteIfEnabled(
  featureFlags,
  wasteRecordStates,
  reference
) {
  if (featureFlags?.isReportDataValidationEnabled()) {
    assertReportDataComplete(wasteRecordStates, reference)
  }
}

/**
 * Summarises incomplete summary-log rows for the GET report-detail preview when
 * the feature flag is on, mirroring the POST gate's issue payload without
 * throwing. Returns `null` when the flag is off — or on but nothing is missing —
 * so the generate branch attaches the field only when there is something to
 * report.
 *
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags | undefined} featureFlags
 * @param {import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState[]} wasteRecordStates
 * @returns {{ total: number, issues: import('./report-mandatory/assert-report-data-complete.js').Issue[] } | null}
 */
function summariseIncompleteDataIfEnabled(featureFlags, wasteRecordStates) {
  if (!featureFlags?.isReportDataValidationEnabled()) {
    return null
  }
  return summariseIncompleteData(wasteRecordStates)
}

/**
 * Creates a report for a given period. Validates the period has ended,
 * checks no report already exists, aggregates waste data, and persists.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} params.summaryLogRowStatesRepository
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
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.featureFlags]
 * @returns {Promise<import('#reports/repository/port.js').Report>}
 */
export async function createReportForPeriod({
  reportsRepository,
  ledgerRepository,
  summaryLogRowStatesRepository,
  packagingRecyclingNotesRepository,
  overseasSitesRepository,
  organisationId,
  registrationId,
  registration,
  year,
  cadence,
  period,
  submissionNumber,
  changedBy,
  featureFlags
}) {
  const { startDate, endDate, dueDate } = getValidatedPeriodInfo(
    cadence,
    year,
    period
  )

  await assertReportCreationAllowed({
    reportsRepository,
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber
  })

  const operatorCategory = getOperatorCategory(registration)

  const { latestSubmission, wasteRecordStates } = await readSubmissionRowStates(
    {
      ledgerRepository,
      summaryLogRowStatesRepository,
      organisationId,
      registrationId,
      registration
    }
  )

  assertReportDataCompleteIfEnabled(
    featureFlags,
    wasteRecordStates,
    registrationId
  )

  const aggregatedReportData = await getAggregatedReportDetail({
    packagingRecyclingNotesRepository,
    overseasSitesRepository,
    operatorCategory,
    organisationId,
    registrationId,
    registration,
    year,
    cadence,
    period,
    wasteRecordStates,
    latestSubmission
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
