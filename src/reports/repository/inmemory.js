import { conflict } from '#common/helpers/logging/cdp-boom.js'
import {
  ACTIVE_REPORT_STATUSES,
  REPORT_STATUS
} from '#reports/domain/report-status.js'
import { periodKey } from '#reports/domain/period-key.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import {
  latestSubmissionPerPeriod,
  mapReport,
  prepareCreateReportParams,
  transformToPeriodicReports
} from '#root/reports/repository/helpers.js'
import Boom from '@hapi/boom'
import {
  validateCreateReport,
  validateDeleteReportParams,
  validateFindPeriodicReports,
  validateFindPeriodicReportsForYear,
  validateFindReportById,
  validateHasReportSubmittedSince,
  validateMarkActiveReportsStale,
  validateMarkActiveReportsStaleForPrnCancellation,
  validateMarkSubmittedReportsRequiringResubmission,
  validateMarkSubmittedReportRequiringResubmissionByOperator,
  validateUpdateReport,
  validateUpdateReportStatus
} from './validation.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

/**
 * @import {
 *   CreateReportParams,
 *   DeleteReportParams,
 *   FindPeriodicReportsParams,
 *   MarkSubmittedReportRequiringResubmissionResult,
 *   MarkSubmittedReportsRequiringResubmissionParams,
 *   PeriodicReport,
 *   RegistrationKey,
 *   Report,
 *   ReportsRepositoryFactory,
 *   UpdateReportParams,
 *   UpdateReportStatusParams
 * } from './port.js'
 */

/**
 * Finds the active (non-submitted) report matching a specific period criteria.
 * @param {Map<string, Report>} reports - A Map where values are report objects.
 * @param {object} criteria - The unique identifiers for the report criteria.
 * @param {OrganisationNumber} criteria.organisationNumber
 * @param {RegistrationNumber} criteria.registrationNumber
 * @param {Year} criteria.year - The reporting year.
 * @param {string} criteria.cadence - The reporting frequency (e.g., 'MONTHLY').
 * @param {number} criteria.period - The specific period index.
 * @param {number} [criteria.submissionNumber] - Optional submission number; when provided narrows the match to that slot.
 * @returns {object|undefined} The matching report object, or undefined if none found.
 */
const findActiveBySlot = (reports, criteria) => {
  const slotKeys = Object.keys(criteria)

  return [...reports.values()].find(
    (r) =>
      slotKeys.every((key) => r[key] === criteria[key]) &&
      r.status.currentStatus !== REPORT_STATUS.SUBMITTED
  )
}

/**
 * @param {Map<string, Object>} reports
 * @param {CreateReportParams} params
 * @returns {Promise<Report>}
 */
const createReport = async (reports, params) => {
  const validated = validateCreateReport(params)
  const {
    organisationNumber,
    registrationNumber,
    year,
    cadence,
    period,
    submissionNumber
  } = validated

  const conflictBoom = () =>
    conflict(
      `An active report already exists for cadence ${cadence} and period ${period}`,
      errorCodes.reportAlreadyExists,
      {
        event: {
          action: 'create_report',
          reason: `cadence=${cadence} period=${period} submissionNumber=${submissionNumber}`
        }
      }
    )

  // Mirror compound unique index: no active report for this exact submission slot
  const existingSlot = findActiveBySlot(reports, {
    organisationNumber,
    registrationNumber,
    year,
    cadence,
    period,
    submissionNumber
  })
  if (existingSlot) {
    throw conflictBoom()
  }

  // Mirror partial unique index: no active draft for this period slot regardless of submissionNumber
  const activeDraft = findActiveBySlot(reports, {
    organisationNumber,
    registrationNumber,
    year,
    cadence,
    period
  })
  if (activeDraft) {
    throw conflictBoom()
  }
  const report = prepareCreateReportParams(validated)
  reports.set(report.id, report)
  return structuredClone(report)
}

/**
 * @param {Map<string, Object>} reports
 * @param {UpdateReportParams} params
 * @returns {Promise<Report>}
 */
const updateReport = async (reports, params) => {
  const validated = validateUpdateReport(params)
  const { reportId, version, fields } = validated

  const existing = reports.get(reportId)

  if (!existing) {
    throw Boom.notFound(`Report not found: ${reportId}`)
  }

  if (existing.version !== version) {
    throw Boom.conflict(
      `Version conflict: expected version ${version} for report ${reportId}`
    )
  }

  const updated = { ...existing, ...fields, version: existing.version + 1 }
  if (fields.exportActivity !== undefined) {
    updated.exportActivity = {
      ...existing.exportActivity,
      ...fields.exportActivity
    }
  }
  reports.set(reportId, updated)
  return mapReport(structuredClone(updated))
}

/**
 * @param {Map<string, Object>} reports
 * @param {UpdateReportStatusParams} params
 * @returns {Promise<Report>}
 */
const updateReportStatus = async (reports, params) => {
  const { slot, ...statusParams } = params
  const { reportId, version, status, changedBy, submissionDeclaredBy } =
    validateUpdateReportStatus(statusParams)

  const existing = reports.get(reportId)

  if (!existing) {
    throw Boom.notFound(`Report not found: ${reportId}`)
  }

  if (existing.version !== version) {
    throw Boom.conflict(
      `Version conflict: expected version ${version} for report ${reportId}`
    )
  }

  const now = new Date().toISOString()
  const slotValue =
    submissionDeclaredBy === undefined
      ? { at: now, by: changedBy }
      : { at: now, by: changedBy, declaredBy: submissionDeclaredBy }

  const updated = {
    ...existing,
    version: existing.version + 1,
    status: {
      ...existing.status,
      currentStatus: status,
      currentStatusAt: now,
      [slot]: slotValue,
      history: [...existing.status.history, { status, at: now, by: changedBy }]
    }
  }

  reports.set(reportId, updated)
  return mapReport(structuredClone(updated))
}

/**
 * Hard-deletes the report identified by the given period slot and submissionNumber.
 *
 * @param {Map<string, Object>} reports
 * @param {DeleteReportParams} params
 * @returns {Promise<void>}
 */
const deleteReport = async (reports, params) => {
  const validated = validateDeleteReportParams(params)
  const {
    organisationNumber,
    registrationNumber,
    year,
    cadence,
    period,
    submissionNumber
  } = validated

  const report = [...reports.values()].find(
    (r) =>
      r.organisationNumber === organisationNumber &&
      r.registrationNumber === registrationNumber &&
      r.year === year &&
      r.cadence === cadence &&
      r.period === period &&
      r.submissionNumber === submissionNumber
  )

  if (!report) {
    throw Boom.notFound(
      `No report found for cadence ${cadence} and period ${period}`
    )
  }

  reports.delete(report.id)
}

/**
 * @param {Map<string, Object>} reports
 * @param {string} reportId
 * @returns {Promise<Report>}
 */
const findReportById = async (reports, reportId) => {
  const validatedId = validateFindReportById(reportId)
  const report = reports.get(validatedId)
  if (!report) {
    throw Boom.notFound(`Report not found: ${validatedId}`)
  }
  return mapReport(structuredClone(report))
}

/**
 * @param {Object} report
 * @param {RegistrationKey} key
 * @returns {boolean}
 */
const isForRegistration = (
  report,
  { organisationNumber, registrationNumber }
) =>
  report.organisationNumber === organisationNumber &&
  report.registrationNumber === registrationNumber

/**
 * @param {Map<string, Object>} reports
 * @param {FindPeriodicReportsParams} params
 * @returns {Promise<PeriodicReport[]>}
 */
const findPeriodicReports = async (reports, params) => {
  const key = validateFindPeriodicReports(params)

  const matching = [...reports.values()].filter((r) =>
    isForRegistration(r, key)
  )

  return structuredClone(transformToPeriodicReports(matching))
}

/**
 * Returns all periodic reports across every org/registration, with
 * submittedAt/submittedBy embedded in each ReportSummary.
 *
 * @param {Map<string, Object>} reports
 * @returns {Promise<PeriodicReport[]>}
 */
const findAllPeriodicReports = async (reports) => {
  const allDocs = [...reports.values()]
  return transformToPeriodicReports(allDocs)
}

/**
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').FindPeriodicReportsForYearParams} params
 * @returns {Promise<PeriodicReport[]>}
 */
const findPeriodicReportsForYear = async (reports, params) => {
  const { year } = validateFindPeriodicReportsForYear(params)
  return transformToPeriodicReports(
    [...reports.values()].filter((r) => r.year === year)
  )
}

/**
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').MarkActiveReportsStaleForSummaryLogParams} params
 * @returns {Promise<import('./port.js').MarkReportStaleResult[]>}
 */
const markActiveReportsStaleForSummaryLog = async (reports, params) => {
  const {
    organisationNumber,
    registrationNumber,
    year,
    summaryLogId,
    uploadedAt
  } = validateMarkActiveReportsStale(params)

  const key = { organisationNumber, registrationNumber }
  const summaryLogChanged = { uploadedAt, summaryLogId }

  let modifiedCount = 0

  for (const [id, report] of reports) {
    if (
      isForRegistration(report, key) &&
      report.year === year &&
      ACTIVE_REPORT_STATUSES.has(report.status.currentStatus) &&
      !report.stale?.summaryLogChanged &&
      report.source?.summaryLogId !== summaryLogId
    ) {
      reports.set(id, {
        ...report,
        stale: { ...report.stale, summaryLogChanged },
        version: report.version + 1
      })
      modifiedCount++
    }
  }

  if (modifiedCount === 0) {
    return []
  }

  return [...reports.values()]
    .filter(
      (r) =>
        isForRegistration(r, key) &&
        r.stale?.summaryLogChanged?.summaryLogId === summaryLogId
    )
    .map((r) =>
      structuredClone({
        reportId: r.id,
        accreditationNumber: r.accreditationNumber,
        year: r.year,
        cadence: r.cadence,
        period: r.period,
        submissionNumber: r.submissionNumber,
        stale: { summaryLogChanged: r.stale.summaryLogChanged }
      })
    )
}

/**
 * Whether `report` occupies the given org/reg/period slot, irrespective of
 * status.
 *
 * @param {Object} report
 * @param {RegistrationKey & { year: Year, cadence: string, period: number }} slot
 * @returns {boolean}
 */
const isReportInPeriodSlot = (report, slot) =>
  isForRegistration(report, slot) &&
  report.year === slot.year &&
  report.cadence === slot.cadence &&
  report.period === slot.period

/**
 * Whether `report` is active and not yet flagged stale for a PRN
 * cancellation (first cancellation wins; later ones are no-ops here).
 *
 * @param {Object} report
 * @returns {boolean}
 */
const isUnflaggedForPrnCancellation = (report) =>
  ACTIVE_REPORT_STATUSES.has(report.status.currentStatus) &&
  !report.stale?.prnCancelled

/**
 * Whether `report` is the active report matching the given org/reg/period
 * slot and not yet flagged stale for a PRN cancellation.
 *
 * @param {Object} report
 * @param {RegistrationKey & { year: Year, cadence: string, period: number }} criteria
 * @returns {boolean}
 */
const isActiveReportForPrnCancellationSlot = (report, criteria) =>
  isReportInPeriodSlot(report, criteria) &&
  isUnflaggedForPrnCancellation(report)

/**
 * Marks the active (in_progress / ready_to_submit) report for the given
 * org/reg/period as stale for a PRN cancellation. Skips it if already
 * flagged for this `prnId` (retry-safe). At most one active report can match
 * — reporting periods don't overlap, and only one active draft can exist per
 * period — so this returns zero or one result.
 *
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').MarkActiveReportsStaleForPrnCancellationParams} params
 * @returns {Promise<import('./port.js').MarkReportStaleResult[]>}
 */
const markActiveReportsStaleForPrnCancellation = async (reports, params) => {
  const {
    organisationNumber,
    registrationNumber,
    year,
    cadence,
    period,
    prnId,
    occurredAt
  } = validateMarkActiveReportsStaleForPrnCancellation(params)

  const prnCancelled = { occurredAt, prnId }
  const slot = { organisationNumber, registrationNumber, year, cadence, period }

  let modifiedCount = 0

  for (const [id, report] of reports) {
    if (isActiveReportForPrnCancellationSlot(report, slot)) {
      reports.set(id, {
        ...report,
        stale: { ...report.stale, prnCancelled },
        version: report.version + 1
      })
      modifiedCount++
    }
  }

  if (modifiedCount === 0) {
    return []
  }

  return [...reports.values()]
    .filter(
      (r) =>
        isReportInPeriodSlot(r, slot) && r.stale?.prnCancelled?.prnId === prnId
    )
    .map((r) =>
      structuredClone({
        reportId: r.id,
        accreditationNumber: r.accreditationNumber,
        year: r.year,
        cadence: r.cadence,
        period: r.period,
        submissionNumber: r.submissionNumber,
        stale: { prnCancelled: r.stale.prnCancelled }
      })
    )
}

/**
 * @param {Map<string, Object>} reports
 * @param {MarkSubmittedReportsRequiringResubmissionParams} params
 * @returns {Promise<MarkSubmittedReportRequiringResubmissionResult[]>}
 */
const markSubmittedReportsRequiringResubmission = async (
  reports,
  { organisationNumber, registrationNumber, summaryLogId, uploadedAt, periods }
) => {
  validateMarkSubmittedReportsRequiringResubmission({
    organisationNumber,
    registrationNumber,
    summaryLogId,
    uploadedAt,
    periods
  })

  const closedPeriodRestated = { uploadedAt, summaryLogId }

  const wantedPeriods = new Set(periods.map(periodKey))

  const alreadyHandled = (/** @type {Report} */ report) =>
    report.resubmissionRequired?.closedPeriodRestated?.summaryLogId ===
    summaryLogId

  const submitted = /** @type {Report[]} */ ([...reports.values()]).filter(
    (r) =>
      isForRegistration(r, { organisationNumber, registrationNumber }) &&
      r.status.currentStatus === REPORT_STATUS.SUBMITTED &&
      wantedPeriods.has(periodKey(r))
  )

  const toFlag = latestSubmissionPerPeriod(submitted).filter(
    (report) => !alreadyHandled(report)
  )

  const persistResubmissionFlag = (/** @type {Report} */ report) =>
    reports.set(report.id, {
      ...report,
      resubmissionRequired: {
        ...report.resubmissionRequired,
        closedPeriodRestated
      },
      version: report.version + 1
    })

  toFlag.forEach(persistResubmissionFlag)

  return toFlag.map((report) =>
    structuredClone({
      reportId: report.id,
      accreditationNumber: report.accreditationNumber,
      year: report.year,
      cadence: report.cadence,
      period: report.period,
      submissionNumber: report.submissionNumber,
      resubmissionRequired: { closedPeriodRestated }
    })
  )
}

/**
 * Whether `report` exactly matches the given org/reg/period/submissionNumber
 * natural key, irrespective of status.
 *
 * @param {Object} report
 * @param {RegistrationKey & { year: Year, cadence: string, period: number, submissionNumber: number }} key
 * @returns {boolean}
 */
const isReportAtSubmissionSlot = (report, key) =>
  isReportInPeriodSlot(report, key) &&
  report.submissionNumber === key.submissionNumber

/**
 * Flags the exact report identified by `submissionNumber` as requiring
 * resubmission at the operator's own request. Mirrors mongodb.js's
 * conditional write, returning `null` when nothing matched.
 *
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').MarkSubmittedReportRequiringResubmissionByOperatorParams} params
 * @returns {Promise<import('./port.js').MarkSubmittedReportRequiringResubmissionByOperatorFlaggedResult | null>}
 */
const markSubmittedReportRequiringResubmissionByOperator = async (
  reports,
  params
) => {
  const {
    organisationNumber,
    registrationNumber,
    year,
    cadence,
    period,
    submissionNumber,
    requestedBy,
    requestedAt
  } = validateMarkSubmittedReportRequiringResubmissionByOperator(params)

  const naturalKey = {
    organisationNumber,
    registrationNumber,
    year,
    cadence,
    period,
    submissionNumber
  }

  const operatorRequested = { requestedAt, requestedBy }

  const match = [...reports].find(([, r]) =>
    isReportAtSubmissionSlot(r, naturalKey)
  )

  const isEligible =
    match?.[1].status.currentStatus === REPORT_STATUS.SUBMITTED &&
    !match[1].resubmissionRequired?.operatorRequested

  if (!isEligible || !match) {
    return null
  }

  const [id, report] = match

  const updated = {
    ...report,
    resubmissionRequired: { ...report.resubmissionRequired, operatorRequested },
    version: report.version + 1
  }
  reports.set(id, updated)

  return structuredClone({
    reportId: updated.id,
    accreditationNumber: updated.accreditationNumber,
    year: updated.year,
    cadence: updated.cadence,
    period: updated.period,
    submissionNumber: updated.submissionNumber,
    resubmissionRequired: updated.resubmissionRequired
  })
}

/**
 * Returns true when any report for the org/reg/year was submitted strictly
 * after `since`. SUBMITTED is terminal and each submission is a distinct
 * document, so the denormalised `status.submitted` slot is the single
 * submission instant.
 *
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').HasReportSubmittedSinceParams} params
 * @returns {Promise<boolean>}
 */
const hasReportSubmittedSince = async (reports, params) => {
  const { organisationNumber, registrationNumber, year, since } =
    validateHasReportSubmittedSince(params)
  // Both `at` and `since` are canonical `new Date().toISOString()` values, so a
  // lexical compare tracks chronological order (the ISO invariant this codebase
  // relies on throughout).
  return [...reports.values()].some(
    (report) =>
      isForRegistration(report, { organisationNumber, registrationNumber }) &&
      report.year === year &&
      report.status.submitted?.at > since
  )
}

/**
 * Create an in-memory reports repository.
 *
 * The store is used by reference so test fixtures can seed data directly.
 *
 * @param {Map<string, Object>} [initialReports]
 * @returns {ReportsRepositoryFactory}
 */
export const createInMemoryReportsRepository = (initialReports = new Map()) => {
  const reports = initialReports

  return () => ({
    createReport: (params) => createReport(reports, params),
    updateReport: (params) => updateReport(reports, params),
    updateReportStatus: (params) => updateReportStatus(reports, params),
    deleteReport: (params) => deleteReport(reports, params),
    findReportById: (reportId) => findReportById(reports, reportId),
    findPeriodicReports: (params) => findPeriodicReports(reports, params),
    findAllPeriodicReports: () => findAllPeriodicReports(reports),
    findPeriodicReportsForYear: (params) =>
      findPeriodicReportsForYear(reports, params),
    markActiveReportsStaleForSummaryLog: (params) =>
      markActiveReportsStaleForSummaryLog(reports, params),
    markActiveReportsStaleForPrnCancellation: (params) =>
      markActiveReportsStaleForPrnCancellation(reports, params),
    markSubmittedReportsRequiringResubmission: (params) =>
      markSubmittedReportsRequiringResubmission(reports, params),
    markSubmittedReportRequiringResubmissionByOperator: (params) =>
      markSubmittedReportRequiringResubmissionByOperator(reports, params),
    hasReportSubmittedSince: (params) =>
      hasReportSubmittedSince(reports, params)
  })
}
