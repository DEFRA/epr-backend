import Boom from '@hapi/boom'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  validateCreateReport,
  validateDeleteReportParams,
  validateFindPeriodicReports,
  validateFindReportById,
  validateUpdateReport,
  validateUpdateReportStatus
} from './validation.js'
import {
  prepareCreateReportParams,
  STATUS_TO_SLOT,
  groupAsPeriodicReports
} from '#root/reports/repository/helpers.js'

/**
 * @import {
 *   CreateReportParams,
 *   DeleteReportParams,
 *   FindPeriodicReportsParams,
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
    throw Boom.conflict(
      `An active report already exists for cadence ${cadence} and period ${period}`
    )
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
    throw Boom.conflict(
      `An active report already exists for cadence ${cadence} and period ${period}`
    )
  }
  const report = prepareCreateReportParams(validated)
  reports.set(report.id, report)
  return structuredClone(report)
}

/**
 * @param {Map<string, Object>} reports
 * @param {UpdateReportParams} params
 * @returns {Promise<void>}
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
}

/**
 * @param {Map<string, Object>} reports
 * @param {UpdateReportStatusParams} params
 * @returns {Promise<Report>}
 */
const updateReportStatus = async (reports, params) => {
  const validated = validateUpdateReportStatus(params)
  const { reportId, version, status, changedBy } = validated

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
  const slot = STATUS_TO_SLOT[status]

  const updated = {
    ...existing,
    version: existing.version + 1,
    status: {
      ...existing.status,
      currentStatus: status,
      currentStatusAt: now,
      [slot]: { at: now, by: changedBy },
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
    findPeriodicReports: (params) => findPeriodicReports(reports, params)
  })
}
