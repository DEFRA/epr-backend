import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  validateCreateReport,
  validateUpdateReport,
  validateUpdateReportStatus,
  validateDeleteReportParams,
  validateFindPeriodicReports,
  validateFindReportById
} from './validation.js'
import { groupAsPeriodicReports } from './group-periodic-reports.js'

/** @type {Record<string, string>} */
const STATUS_TO_SLOT = {
  [REPORT_STATUS.IN_PROGRESS]: 'created',
  [REPORT_STATUS.READY_TO_SUBMIT]: 'ready',
  [REPORT_STATUS.SUBMITTED]: 'submitted'
}

/**
 * Finds the non-submitted report for a given period slot.
 *
 * @param {Map<string, Object>} reports
 * @param {{ organisationId: string, registrationId: string, year: number, cadence: string, period: number, submissionNumber: number }} slot
 * @returns {Object|undefined}
 */
const findActiveBySlot = (
  reports,
  { organisationId, registrationId, year, cadence, period, submissionNumber }
) =>
  [...reports.values()].find(
    (r) =>
      r.organisationId === organisationId &&
      r.registrationId === registrationId &&
      r.year === year &&
      r.cadence === cadence &&
      r.period === period &&
      r.submissionNumber === submissionNumber &&
      r.status.currentStatus !== REPORT_STATUS.SUBMITTED
  )

/**
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').CreateReportParams} params
 * @returns {Promise<import('./port.js').Report>}
 */
const createReport = async (reports, params) => {
  const validated = validateCreateReport(params)
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber,
    startDate,
    endDate,
    dueDate,
    changedBy,
    material,
    wasteProcessingType,
    siteAddress,
    recyclingActivity,
    exportActivity,
    wasteSent,
    prn,
    supportingInformation
  } = validated

  const existing = findActiveBySlot(reports, {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber
  })
  if (existing) {
    throw Boom.conflict(
      `An active report already exists for cadence ${cadence} and period ${period}`
    )
  }

  const now = new Date().toISOString()
  const reportId = randomUUID()

  const report = Object.fromEntries(
    Object.entries({
      id: reportId,
      version: 1,
      schemaVersion: 1,
      submissionNumber,
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      startDate,
      endDate,
      dueDate,
      material,
      wasteProcessingType,
      siteAddress,
      recyclingActivity,
      exportActivity,
      wasteSent,
      prn,
      supportingInformation,
      status: {
        currentStatus: REPORT_STATUS.IN_PROGRESS,
        currentStatusAt: now,
        [STATUS_TO_SLOT[REPORT_STATUS.IN_PROGRESS]]: { at: now, by: changedBy },
        history: [{ status: REPORT_STATUS.IN_PROGRESS, at: now, by: changedBy }]
      }
    }).filter(([, v]) => v !== undefined)
  )

  reports.set(reportId, report)
  return structuredClone(
    /** @type {import('./port.js').Report} */ (/** @type {unknown} */ (report))
  )
}

/**
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').UpdateReportParams} params
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

  reports.set(reportId, {
    ...existing,
    version: existing.version + 1,
    supportingInformation: fields.supportingInformation
  })
}

/**
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').UpdateReportStatusParams} params
 * @returns {Promise<void>}
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
}

/**
 * Hard-deletes the report identified by the given period slot and submissionNumber.
 *
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').DeleteReportParams} params
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
 * @returns {Promise<import('./port.js').Report>}
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
 * @param {import('./port.js').FindPeriodicReportsParams} params
 * @returns {Promise<import('./port.js').PeriodicReport[]>}
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
 * @returns {import('./port.js').ReportsRepositoryFactory}
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
