import { badRequest, conflict } from '#common/helpers/logging/cdp-boom.js'
import { resolveDetailedMaterial } from '#domain/organisations/registration-utils.js'
import { getOrsDetailsMap } from '#overseas-sites/application/get-ors-details-map.js'
import { getIssuedTonnage } from '#packaging-recycling-notes/application/get-issued-tonnage.js'
import { latestSubmittedSummaryLog } from '#waste-balances/application/latest-submitted-summary-log.js'
import { summaryLogRowStatesForRegistration } from '#waste-records/application/read-summary-log-row-states.js'
import { aggregateReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import { isClosedPeriodAdjustmentsEnabled } from '#root/config.js'

/**
 * @import { PeriodicReport } from '#reports/repository/port.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
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
 * Finds the submission summary for a specific submission number within periodic
 * reports, checking both the current slot and previous submissions.
 * @param {PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {import('#reports/repository/port.js').ReportSummary | null}
 */
function findSubmissionByNumber(
  periodicReports,
  year,
  cadence,
  period,
  submissionNumber
) {
  const slot = periodicReports.find((pr) => pr.year === year)?.reports?.[
    cadence
  ]?.[period]
  if (!slot) {
    return null
  }
  if (slot.current?.submissionNumber === submissionNumber) {
    return slot.current
  }
  return (
    slot.previousSubmissions?.find(
      (s) => s.submissionNumber === submissionNumber
    ) ?? null
  )
}

/**
 * Finds the report ID for a specific submission number within periodic reports,
 * checking both the current slot and previous submissions.
 * @param {PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {string|null}
 */
function findReportIdBySubmissionNumber(
  periodicReports,
  year,
  cadence,
  period,
  submissionNumber
) {
  return (
    findSubmissionByNumber(
      periodicReports,
      year,
      cadence,
      period,
      submissionNumber
    )?.id ?? null
  )
}

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
 * @param {object|undefined} address
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
 * @typedef {{ period: number, startDate: string, endDate: string, dueDate: string }} PeriodInfo
 */

/**
 * Throws a 400 Boom with `output.payload.invalidPeriod` if the period isn't
 * in the cadence's valid range for the year.
 *
 * @param {number} period
 * @param {Cadence} cadence
 * @param {PeriodInfo[]} allPeriods
 * @returns {PeriodInfo}
 */
const assertValidPeriod = (period, cadence, allPeriods) => {
  const periodInfo = allPeriods.find((p) => p.period === period)
  if (!periodInfo) {
    const validPeriods = allPeriods.map((p) => p.period)
    throw badRequest(
      `Invalid period ${period} for cadence ${cadence}`,
      errorCodes.invalidPeriod,
      {
        event: {
          action: 'create_report',
          reason: `actual=${period} cadence=${cadence} validPeriods=[${validPeriods.join(',')}]`
        },
        payload: { invalidPeriod: { actual: period, cadence, validPeriods } }
      }
    )
  }
  return periodInfo
}

/**
 * Throws a 400 Boom with `output.payload.periodNotEnded` if the period's
 * end date has not yet passed.
 *
 * @param {PeriodInfo} periodInfo
 * @param {number} period
 * @param {Cadence} cadence
 * @returns {void}
 */
const assertPeriodEnded = (periodInfo, period, cadence) => {
  const dayAfterEnd = new Date(periodInfo.endDate)
  dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1)
  if (dayAfterEnd > new Date()) {
    const earliestSubmissionDate = dayAfterEnd.toISOString()
    throw badRequest(
      `Cannot create report for period ${period} — period has not yet ended`,
      errorCodes.periodNotEnded,
      {
        event: {
          action: 'create_report',
          reason: `period=${period} cadence=${cadence} endDate=${periodInfo.endDate} earliestSubmissionDate=${earliestSubmissionDate}`
        },
        payload: {
          periodNotEnded: {
            period,
            cadence,
            endDate: periodInfo.endDate,
            earliestSubmissionDate
          }
        }
      }
    )
  }
}

/**
 * Throws a 409 Boom with `output.payload.existingReport` if a report for the
 * same period already exists.
 *
 * @param {PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @returns {void}
 */
const assertNoExistingReport = (
  periodicReports,
  year,
  cadence,
  period,
  submissionNumber
) => {
  const id = findReportIdBySubmissionNumber(
    periodicReports,
    year,
    cadence,
    period,
    submissionNumber
  )
  if (id) {
    throw conflict(
      `Report already exists for ${cadence} period ${period} of ${year}`,
      errorCodes.reportAlreadyExists,
      {
        event: {
          action: 'create_report',
          reason: `cadence=${cadence} period=${period} year=${year}`,
          reference: id
        },
        payload: { existingReport: { id, cadence, period, year } }
      }
    )
  }
}

/**
 * Throws a 409 Boom when creating a resubmission (submissionNumber > 1) is not
 * allowed. A resubmission requires the closed-period-adjustments feature flag
 * to be on and the previous submission to be a submitted report flagged as
 * requiring resubmission. The flag is checked first, then the block rule; each
 * failure carries a distinct `reason` so the frontend can tell them apart from
 * the duplicate-period conflict.
 *
 * @param {PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {Cadence} cadence
 * @param {number} period
 * @param {number} submissionNumber
 * @returns {void}
 */
const assertResubmissionAllowed = (
  periodicReports,
  year,
  cadence,
  period,
  submissionNumber
) => {
  if (submissionNumber <= 1) {
    return
  }

  const reject = (reason) =>
    conflict(
      `Resubmission ${submissionNumber} not permitted for ${cadence} period ${period} of ${year}`,
      reason,
      {
        event: {
          action: 'create_report',
          reason: `cadence=${cadence} period=${period} year=${year} submissionNumber=${submissionNumber} rejected=${reason}`
        },
        payload: { reason }
      }
    )

  if (!isClosedPeriodAdjustmentsEnabled()) {
    throw reject(errorCodes.resubmissionFeatureDisabled)
  }

  const previous = findSubmissionByNumber(
    periodicReports,
    year,
    cadence,
    period,
    submissionNumber - 1
  )
  const permitted =
    previous?.status === REPORT_STATUS.SUBMITTED &&
    Boolean(previous?.resubmissionRequired)
  if (!permitted) {
    throw reject(errorCodes.resubmissionNotPermitted)
  }
}

/**
 * Validates that a period exists for the given cadence and has ended.
 * @param {Cadence} cadence
 * @param {number} year
 * @param {number} period
 * @returns {{ startDate: string, endDate: string, dueDate: string }}
 */
function getValidatedPeriodInfo(cadence, year, period) {
  const allPeriods = generateAllPeriodsForYear(cadence, year)
  const periodInfo = assertValidPeriod(period, cadence, allPeriods)
  assertPeriodEnded(periodInfo, period, cadence)
  return periodInfo
}

/**
 * Extracts the report-specific fields from aggregated data and registration.
 * @param {import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail & { prn?: { issuedTonnage: number } | null }} aggregated
 * @param {object} registration
 * @returns {object}
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
 * @param {object} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {object} params.registration
 * @param {number} params.year
 * @param {Cadence} params.cadence
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @returns {Promise<import('#reports/repository/port.js').Report | import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail>}
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
  const storedReport = await fetchReportBySubmissionNumber(
    reportsRepository,
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber
  )

  if (storedReport) {
    return storedReport
  }

  const operatorCategory = getOperatorCategory(registration)

  return getAggregatedReportDetail({
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
}

/**
 * Resolves the report source — which submission produced the current state, and
 * when it was submitted — from the latest submitted summary log. A stream with
 * no submission yet has a null source.
 *
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
 * @returns {Promise<{ summaryLogId: string|null, lastUploadedAt: string|null }>}
 */
async function resolveSource(ledgerRepository, ledgerId) {
  const latest = await latestSubmittedSummaryLog(ledgerRepository, ledgerId)
  return latest === null
    ? { summaryLogId: null, lastUploadedAt: null }
    : {
        summaryLogId: latest.summaryLogId,
        lastUploadedAt: latest.submittedAt.toISOString()
      }
}

/**
 * Aggregates a registration's waste-record states at its latest submitted
 * summary log into a report and appends issued PRN tonnage.
 * @param {object} params
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} params.summaryLogRowStateRepository
 * @param {object} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
 * @param {string} params.operatorCategory
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {object} params.registration
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

  const wasteRecordStates = await summaryLogRowStatesForRegistration({
    ledgerRepository,
    summaryLogRowStateRepository,
    ...ledgerId
  })

  const source = await resolveSource(ledgerRepository, ledgerId)

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
 * @param {object} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {object} params.registration
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
