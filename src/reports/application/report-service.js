/** @import {SummaryLogFileId} from '#domain/summary-logs/ids.js' */
import { getIssuedTonnage } from '#packaging-recycling-notes/application/get-issued-tonnage.js'
import { latestSubmittedSummaryLog } from '#waste-balances/application/latest-submitted-summary-log.js'
import { wasteRecordStatesForHead } from '#waste-records/application/read-summary-log-row-states.js'
import { aggregateReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
import { reportOperatorCategory } from '#reports/domain/operator-category.js'
import { assertPeriodRequired } from './assert-period-required.js'
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
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { Material } from '#domain/organisations/model.js'
 * @import { ExporterAccreditation, UkAddress } from '#organisation-read-model/domain/model.js'
 * @import { OrsDetails } from '#overseas-sites/application/get-ors-details-map.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { AggregatedReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
 * @import { Cadence, CadenceAccreditation } from '#reports/domain/cadence.js'
 * @import { GeneratedPeriod } from '#reports/domain/generate-reporting-periods.js'
 * @import { ReportRegistration } from '#reports/domain/operator-category.js'
 * @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js'
 * @import { PeriodicReport, RegistrationKey } from '#reports/repository/port.js'
 */

/**
 * Application-layer facade over the reports repository for cross-module reads.
 * Consumers outside the reports module (for example summary-logs) depend on this
 * service rather than the repository port directly. See PAE-1686.
 *
 * @typedef {object} ReportsService
 * @property {(organisationNumber: OrganisationNumber, registrationNumber: RegistrationNumber, since: string) => Promise<boolean>} hasReportSubmittedSince
 * @property {(params: RegistrationKey) => Promise<PeriodicReport[]>} findPeriodicReports
 * @property {(reportId: string) => Promise<import('#reports/repository/port.js').Report>} findReportById
 */

/**
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @returns {ReportsService}
 */
export const createReportsService = (reportsRepository) => ({
  hasReportSubmittedSince: (organisationNumber, registrationNumber, since) =>
    reportsRepository.hasReportSubmittedSince(
      organisationNumber,
      registrationNumber,
      since
    ),

  findPeriodicReports: (params) =>
    reportsRepository.findPeriodicReports(params),

  findReportById: (reportId) => reportsRepository.findReportById(reportId)
})

/**
 * Looks up a stored report for a specific period and submission number.
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {RegistrationKey} key
 * @param {Year} year
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {Promise<import('#reports/repository/port.js').Report | null>}
 */
export async function fetchReportBySubmissionNumber(
  reportsRepository,
  { organisationNumber, registrationNumber },
  year,
  cadence,
  period,
  submissionNumber
) {
  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationNumber,
    registrationNumber
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
 * @param {UkAddress} address
 * @returns {string}
 */
function formatSiteAddress(address) {
  if ('fullAddress' in address) {
    return address.fullAddress
  }
  return [address.line1, address.line2, address.town, address.postcode]
    .filter(Boolean)
    .join(', ')
}

/**
 * Each of an exporter's overseas sites by ORS key, approved from the day the
 * accreditation reported under approved it. A reprocessor has none.
 *
 * @param {ReportRegistration} reportRegistration
 * @returns {Map<string, OrsDetails>}
 */
function orsDetailsOf({ registration, accreditation }) {
  if (!('overseasSites' in registration)) {
    return new Map()
  }
  const approvals =
    /** @type {ExporterAccreditation | null} */ (accreditation)
      ?.overseasSites ?? {}
  return new Map(
    Object.entries(registration.overseasSites).map(([orsKey, site]) => {
      const approval = approvals[orsKey]
      return [
        orsKey,
        {
          siteName: site.name,
          country: site.address.country,
          validFrom:
            approval?.status === 'approved'
              ? new Date(approval.approvedOn)
              : null
        }
      ]
    })
  )
}

/**
 * @typedef {Pick<AggregatedReportDetail, 'source' | 'recyclingActivity' | 'exportActivity' | 'wasteSent'> & {
 *   material: Material,
 *   wasteProcessingType: string,
 *   siteAddress: string | undefined,
 *   prn: { issuedTonnage: number } | null | undefined
 * }} ReportData
 */

/**
 * Extracts the report-specific fields from aggregated data and registration.
 * @param {AggregatedReportDetail & { prn?: { issuedTonnage: number } | null }} aggregated
 * @param {ReportRegistration['registration']} registration
 * @returns {ReportData}
 */
function buildReportData(aggregated, registration) {
  const { recyclingActivity, exportActivity, wasteSent, prn, source } =
    aggregated
  return {
    material: registration.material,
    wasteProcessingType: registration.wasteProcessingType,
    siteAddress:
      'site' in registration
        ? formatSiteAddress(registration.site.address)
        : undefined,
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
 * @param {RegistrationKey} params.key
 * @param {ReportRegistration} params.reportRegistration
 * @param {Year} params.year
 * @param {CadenceAccreditation} params.cadenceAccreditation
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @param {GeneratedPeriod[]} params.requiredPeriods - the ended periods of the cadence the registration owes a report for in the year
 * @param {boolean} [params.reportDataValidationEnabled]
 * @returns {Promise<(import('#reports/repository/port.js').Report | import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail) & { canRequestResubmission: boolean, incompleteSummaryLogRows?: { total: number, issues: import('./report-mandatory/assert-report-data-complete.js').Issue[] } }>}
 */
export async function fetchOrGenerateReportForPeriod({
  reportsRepository,
  ledgerRepository,
  summaryLogRowStatesRepository,
  packagingRecyclingNotesRepository,
  key: { organisationNumber, registrationNumber },
  reportRegistration,
  year,
  cadenceAccreditation,
  period,
  submissionNumber,
  requiredPeriods,
  reportDataValidationEnabled
}) {
  const { cadence } = cadenceAccreditation
  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationNumber,
    registrationNumber
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

  assertPeriodRequired(periodicReports, requiredPeriods, year, cadence, period)

  const { latestSubmission, wasteRecordStates } = await readSubmissionRowStates(
    {
      ledgerRepository,
      summaryLogRowStatesRepository,
      key: { organisationNumber, registrationNumber },
      accreditation: reportRegistration.accreditation
    }
  )

  const aggregatedReportDetail = await getAggregatedReportDetail({
    packagingRecyclingNotesRepository,
    numbers: { organisationNumber, registrationNumber },
    reportRegistration,
    year,
    cadenceAccreditation,
    period,
    wasteRecordStates,
    latestSubmission
  })

  // Attached on every generate-branch preview. The frontend controller
  // redirects to the validation-error screen unconditionally on this signal;
  // a not-yet-ended period never gets here, as it is not a required period.
  const incompleteSummaryLogRows = summariseIncompleteDataIfEnabled(
    reportDataValidationEnabled,
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
 * @param {{ summaryLogId: SummaryLogFileId, submittedAt: Date } | null} latestSubmission
 * @returns {{ summaryLogId: SummaryLogFileId | null, lastUploadedAt: string|null }}
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
 * @param {RegistrationKey} params.key
 * @param {ReportRegistration['accreditation']} params.accreditation
 */
async function readSubmissionRowStates({
  ledgerRepository,
  summaryLogRowStatesRepository,
  key: { organisationNumber, registrationNumber },
  accreditation
}) {
  const ledgerId = {
    organisationNumber,
    registrationNumber,
    accreditationNumber: accreditation?.accreditationNumber ?? null
  }

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
 * @param {RegistrationKey} params.numbers
 * @param {ReportRegistration} params.reportRegistration
 * @param {Year} params.year
 * @param {CadenceAccreditation} params.cadenceAccreditation
 * @param {number} params.period
 * @param {import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState[]} params.wasteRecordStates
 * @param {Awaited<ReturnType<typeof latestSubmittedSummaryLog>>} params.latestSubmission
 * @returns {Promise<import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail & { prn: { issuedTonnage: number } | null }>}
 */
async function getAggregatedReportDetail({
  packagingRecyclingNotesRepository,
  numbers,
  reportRegistration,
  year,
  cadenceAccreditation: { cadence, accreditationNumber },
  period,
  wasteRecordStates,
  latestSubmission
}) {
  const aggregatedReportDetail = aggregateReportDetail(wasteRecordStates, {
    operatorCategory: reportOperatorCategory(reportRegistration),
    cadence,
    year,
    period,
    source: toSource(latestSubmission),
    orsDetailsMap: orsDetailsOf(reportRegistration)
  })

  const prn = await getIssuedTonnage(packagingRecyclingNotesRepository, {
    organisationNumber: numbers.organisationNumber,
    registrationNumber: numbers.registrationNumber,
    accreditationNumber,
    startDate: aggregatedReportDetail.startDate,
    endDate: aggregatedReportDetail.endDate
  })

  return { ...aggregatedReportDetail, prn }
}

/**
 * Asserts a report can be created for the period. Loads the registration's
 * periodic reports, rejects a period with nothing stored that the registration
 * does not owe, then rejects a duplicate submission before a disallowed
 * resubmission: existence is the more fundamental precondition, so a duplicate
 * is reported as such regardless of whether a fresh create would have been
 * permitted.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {RegistrationKey} params.key
 * @param {Year} params.year
 * @param {Cadence} params.cadence
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @param {GeneratedPeriod[]} params.requiredPeriods
 * @returns {Promise<void>}
 */
async function assertReportCreationAllowed({
  reportsRepository,
  key: { organisationNumber, registrationNumber },
  year,
  cadence,
  period,
  submissionNumber,
  requiredPeriods
}) {
  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationNumber,
    registrationNumber
  })

  assertPeriodRequired(periodicReports, requiredPeriods, year, cadence, period)
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
 * @param {boolean | undefined} reportDataValidationEnabled
 * @param {import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState[]} wasteRecordStates
 * @param {string} reference
 * @returns {void}
 */
function assertReportDataCompleteIfEnabled(
  reportDataValidationEnabled,
  wasteRecordStates,
  reference
) {
  if (reportDataValidationEnabled) {
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
 * @param {boolean | undefined} reportDataValidationEnabled
 * @param {import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState[]} wasteRecordStates
 * @returns {{ total: number, issues: import('./report-mandatory/assert-report-data-complete.js').Issue[] } | null}
 */
function summariseIncompleteDataIfEnabled(
  reportDataValidationEnabled,
  wasteRecordStates
) {
  if (!reportDataValidationEnabled) {
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
 * @param {RegistrationKey} params.numbers
 * @param {ReportRegistration} params.reportRegistration
 * @param {Year} params.year
 * @param {CadenceAccreditation} params.cadenceAccreditation
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @param {GeneratedPeriod[]} params.requiredPeriods - the ended periods of the cadence the registration owes a report for in the year
 * @param {import('#reports/repository/port.js').UserSummary} params.changedBy
 * @param {boolean} [params.reportDataValidationEnabled]
 * @returns {Promise<import('#reports/repository/port.js').Report>}
 */
export async function createReportForPeriod({
  reportsRepository,
  ledgerRepository,
  summaryLogRowStatesRepository,
  packagingRecyclingNotesRepository,
  numbers,
  reportRegistration,
  year,
  cadenceAccreditation,
  period,
  submissionNumber,
  requiredPeriods,
  changedBy,
  reportDataValidationEnabled
}) {
  const { startDate, endDate, dueDate } = getValidatedPeriodInfo(
    cadenceAccreditation.cadence,
    year,
    period
  )

  await assertReportCreationAllowed({
    reportsRepository,
    key: numbers,
    year,
    cadence: cadenceAccreditation.cadence,
    period,
    submissionNumber,
    requiredPeriods
  })

  const { latestSubmission, wasteRecordStates } = await readSubmissionRowStates(
    {
      ledgerRepository,
      summaryLogRowStatesRepository,
      key: numbers,
      accreditation: reportRegistration.accreditation
    }
  )

  assertReportDataCompleteIfEnabled(
    reportDataValidationEnabled,
    wasteRecordStates,
    numbers.registrationNumber
  )

  const aggregatedReportData = await getAggregatedReportDetail({
    packagingRecyclingNotesRepository,
    numbers,
    reportRegistration,
    year,
    cadenceAccreditation,
    period,
    wasteRecordStates,
    latestSubmission
  })

  return reportsRepository.createReport({
    ...numbers,
    ...cadenceAccreditation,
    year,
    period,
    startDate,
    endDate,
    dueDate,
    submissionNumber,
    changedBy,
    ...buildReportData(aggregatedReportData, reportRegistration.registration)
  })
}
