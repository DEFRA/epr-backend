import { conflict } from '#common/helpers/logging/cdp-boom.js'
import {
  ACTIVE_REPORT_STATUSES,
  REPORT_STATUS
} from '#reports/domain/report-status.js'
import { RESUBMISSION_REASON } from '#reports/domain/resubmission.js'
import { periodKey } from '#reports/domain/period-key.js'
import { STALE_REASON } from '#reports/domain/stale.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import {
  groupAsPeriodicReports,
  prepareCreateReportParams,
  transformToPeriodicReports
} from '#root/reports/repository/helpers.js'
import Boom from '@hapi/boom'
import {
  validateCreateReport,
  validateDeleteReportParams,
  validateFindPeriodicReports,
  validateFindReportById,
  validateMarkActiveReportsStale,
  validateMarkSubmittedReportsRequiringResubmission,
  validateUpdateReport,
  validateUpdateReportStatus
} from './validation.js'

/**
 * @import {
 *   CreateReportParams,
 *   DeleteReportParams,
 *   FindPeriodicReportsParams,
 *   MarkReportRequiringResubmissionResult,
 *   MarkSubmittedReportsRequiringResubmissionParams,
 *   PeriodicReport,
 *   Report,
 *   ReportsRepositoryFactory,
 *   UpdateReportParams,
 *   UpdateReportStatusParams
 * } from './port.js'
 */

/**
 * Finds the active (non-submitted) report matching a specific period criteria.
 * @param {Map<string, object>} reports - A Map where values are report objects.
 * @param {object} criteria - The unique identifiers for the report criteria.
 * @param {string} criteria.organisationId - The ID of the organization.
 * @param {string} criteria.registrationId - The ID of the registration.
 * @param {number} criteria.year - The reporting year.
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
    organisationId,
    registrationId,
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
    organisationId,
    registrationId,
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
    organisationId,
    registrationId,
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
  return structuredClone(updated)
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
  return structuredClone(updated)
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
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber
  } = validated

  const report = [...reports.values()].find(
    (r) =>
      r.organisationId === organisationId &&
      r.registrationId === registrationId &&
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
  return structuredClone(report)
}

/**
 * @param {Map<string, Object>} reports
 * @param {FindPeriodicReportsParams} params
 * @returns {Promise<PeriodicReport[]>}
 */
const findPeriodicReports = async (reports, params) => {
  const { organisationId, registrationId } = validateFindPeriodicReports(params)

  const matching = [...reports.values()].filter(
    (r) =>
      r.organisationId === organisationId && r.registrationId === registrationId
  )

  return structuredClone(
    groupAsPeriodicReports(organisationId, registrationId, matching)
  )
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
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {string} summaryLogId
 * @param {string} uploadedAt
 * @returns {Promise<import('./port.js').MarkReportStaleResult[]>}
 */
const markActiveReportsStale = async (
  reports,
  organisationId,
  registrationId,
  summaryLogId,
  uploadedAt
) => {
  validateMarkActiveReportsStale({
    organisationId,
    registrationId,
    summaryLogId,
    uploadedAt
  })

  const stale = {
    uploadedAt,
    reason: STALE_REASON.SUMMARY_LOG_CHANGED,
    summaryLogId
  }

  let modifiedCount = 0

  for (const [id, report] of reports) {
    if (
      report.organisationId === organisationId &&
      report.registrationId === registrationId &&
      ACTIVE_REPORT_STATUSES.has(report.status.currentStatus) &&
      report.stale?.summaryLogId !== summaryLogId &&
      report.source?.summaryLogId !== summaryLogId
    ) {
      reports.set(id, { ...report, stale, version: report.version + 1 })
      modifiedCount++
    }
  }

  if (modifiedCount === 0) {
    return []
  }

  return [...reports.values()]
    .filter(
      (r) =>
        r.organisationId === organisationId &&
        r.registrationId === registrationId &&
        r.stale?.summaryLogId === summaryLogId
    )
    .map((r) =>
      structuredClone({
        reportId: r.id,
        year: r.year,
        cadence: r.cadence,
        period: r.period,
        submissionNumber: r.submissionNumber,
        stale: r.stale
      })
    )
}

/**
 * @param {Map<string, Object>} reports
 * @param {MarkSubmittedReportsRequiringResubmissionParams} params
 * @returns {Promise<MarkReportRequiringResubmissionResult[]>}
 */
const markSubmittedReportsRequiringResubmission = async (
  reports,
  { organisationId, registrationId, summaryLogId, uploadedAt, periods }
) => {
  validateMarkSubmittedReportsRequiringResubmission({
    organisationId,
    registrationId,
    summaryLogId,
    uploadedAt,
    periods
  })

  const resubmissionRequired = {
    uploadedAt,
    reason: RESUBMISSION_REASON.CLOSED_PERIOD_RESTATED,
    summaryLogId
  }

  const wantedPeriods = new Set(periods.map(periodKey))

  const alreadyHandled = (/** @type {Report} */ report) =>
    report.resubmissionRequired?.summaryLogId === summaryLogId ||
    report.source?.summaryLogId === summaryLogId

  const submitted = /** @type {Report[]} */ ([...reports.values()]).filter(
    (r) =>
      r.organisationId === organisationId &&
      r.registrationId === registrationId &&
      r.status.currentStatus === REPORT_STATUS.SUBMITTED &&
      wantedPeriods.has(periodKey(r))
  )

  // Highest submissionNumber wins: sort desc so the first seen per period is latest.
  const latestSubmittedByPeriod = submitted
    .sort((a, b) => b.submissionNumber - a.submissionNumber)
    .reduce((latest, r) => {
      if (!latest.has(periodKey(r))) {
        latest.set(periodKey(r), r)
      }
      return latest
    }, /** @type {Map<string, Report>} */ (new Map()))

  const toFlag = [...latestSubmittedByPeriod.values()].filter(
    (report) => !alreadyHandled(report)
  )

  const persistResubmissionFlag = (/** @type {Report} */ report) =>
    reports.set(report.id, {
      ...report,
      resubmissionRequired,
      version: report.version + 1
    })

  toFlag.forEach(persistResubmissionFlag)

  return toFlag.map((report) =>
    structuredClone({
      reportId: report.id,
      year: report.year,
      cadence: report.cadence,
      period: report.period,
      submissionNumber: report.submissionNumber,
      resubmissionRequired
    })
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
    markActiveReportsStale: (
      organisationId,
      registrationId,
      summaryLogId,
      uploadedAt
    ) =>
      markActiveReportsStale(
        reports,
        organisationId,
        registrationId,
        summaryLogId,
        uploadedAt
      ),
    markSubmittedReportsRequiringResubmission: (params) =>
      markSubmittedReportsRequiringResubmission(reports, params)
  })
}
