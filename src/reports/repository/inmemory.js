import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  validateCreateReport,
  validateUpdateReport,
  validateDeleteReportParams,
  validateFindPeriodicReports,
  validateFindReportById
} from './validation.js'

/**
 * @param {Object[]} periodicReports
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {number} year
 * @returns {Object|undefined}
 */
const findPeriodicReport = (
  periodicReports,
  organisationId,
  registrationId,
  year
) =>
  periodicReports.find(
    (p) =>
      p.organisationId === organisationId &&
      p.registrationId === registrationId &&
      p.year === year
  )

/**
 * @param {Object} periodicReport
 * @param {string} cadence
 * @param {number} period
 * @returns {import('./port.js').ReportPerPeriod|undefined}
 */
const getSlot = (periodicReport, cadence, period) =>
  periodicReport?.reports?.[cadence]?.[period]

/**
 * Upserts the periodic-report slot for a new report, archiving any existing currentReportId.
 *
 * @param {Object[]} periodicReports
 * @param {import('./port.js').UpsertSlotParams} params
 * @returns {void}
 */
const upsertSlot = (periodicReports, params) => {
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    newReportId,
    startDate,
    endDate,
    dueDate
  } = params

  let periodicReport = findPeriodicReport(
    periodicReports,
    organisationId,
    registrationId,
    year
  )
  if (!periodicReport) {
    periodicReport = {
      version: 0,
      organisationId,
      registrationId,
      year,
      reports: {}
    }
    periodicReports.push(periodicReport)
  }
  periodicReport.version += 1
  periodicReport.reports[cadence] ??= {}
  periodicReport.reports[cadence][period] ??= { previousReportIds: [] }

  const existing = periodicReport.reports[cadence][period]
  periodicReport.reports[cadence][period] = {
    ...existing,
    startDate,
    endDate,
    dueDate,
    currentReportId: newReportId,
    previousReportIds: existing.currentReportId
      ? [...existing.previousReportIds, existing.currentReportId]
      : existing.previousReportIds
  }
}

/**
 * @param {Map<string, Object>} reports
 * @param {Object[]} periodicReports
 * @param {Object} params
 * @returns {Promise<import('./port.js').Report>}
 */
const createReport = async (reports, periodicReports, params) => {
  const validated = validateCreateReport(params)
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
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
    prnData,
    supportingInformation
  } = validated

  const now = new Date().toISOString()
  const reportId = randomUUID()

  reports.set(reportId, {
    id: reportId,
    version: 1,
    schemaVersion: 1,
    status: REPORT_STATUS.IN_PROGRESS,
    statusHistory: [
      { status: REPORT_STATUS.IN_PROGRESS, changedBy, changedAt: now }
    ],
    material,
    wasteProcessingType,
    siteAddress,
    recyclingActivity,
    exportActivity,
    wasteSent,
    prnData,
    supportingInformation
  })

  upsertSlot(periodicReports, {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    startDate,
    endDate,
    dueDate,
    newReportId: reportId
  })

  return structuredClone(reports.get(reportId))
}

/**
 * @param {Map<string, Object>} reports
 * @param {Object} params
 * @returns {Promise<void>}
 */
const updateReport = async (reports, params) => {
  const validated = validateUpdateReport(params)
  const { reportId, version, fields, changedBy } = validated

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

  const updated = {
    ...existing,
    ...fields,
    version: existing.version + 1,
    statusHistory: [...existing.statusHistory]
  }

  if (fields.status && fields.status !== existing.status) {
    updated.statusHistory.push({
      status: fields.status,
      changedBy,
      changedAt: now
    })
  }

  reports.set(reportId, updated)
}

/**
 * @param {Map<string, Object>} reports
 * @param {Object[]} periodicReports
 * @param {Object} params
 * @returns {Promise<void>}
 */
const deleteReport = async (reports, periodicReports, params) => {
  const validated = validateDeleteReportParams(params)
  const { organisationId, registrationId, year, cadence, period, changedBy } =
    validated

  const periodicReport = findPeriodicReport(
    periodicReports,
    organisationId,
    registrationId,
    year
  )

  const slot = getSlot(periodicReport, cadence, period)

  if (!slot) {
    throw Boom.notFound(
      `No periodic report found for cadence ${cadence} and period ${period}`
    )
  }

  const { currentReportId } = slot

  if (!currentReportId) {
    throw Boom.notFound(
      `No current report found for cadence ${cadence} and period ${period}`
    )
  }

  const existing = reports.get(currentReportId)
  reports.set(currentReportId, {
    ...existing,
    status: REPORT_STATUS.DELETED,
    version: existing.version + 1,
    statusHistory: [
      ...existing.statusHistory,
      {
        status: REPORT_STATUS.DELETED,
        changedBy,
        changedAt: new Date().toISOString()
      }
    ]
  })

  slot.previousReportIds = [...slot.previousReportIds, currentReportId]
  slot.currentReportId = null
  periodicReport.version += 1
}

/**
 * @param {Map<string, Object>} reports
 * @param {string} reportId
 * @returns {Promise<Object>}
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
 * @param {Object[]} periodicReports
 * @param {Object} params
 * @returns {Promise<Object[]>}
 */
const findPeriodicReports = async (periodicReports, params) => {
  const { organisationId, registrationId } = validateFindPeriodicReports(params)

  const matching = periodicReports.filter(
    (p) =>
      p.organisationId === organisationId && p.registrationId === registrationId
  )

  return structuredClone(matching)
}

/**
 * Create an in-memory reports repository.
 *
 * Both stores are used by reference so test fixtures can seed data directly.
 * reports is a Map keyed by reportId; periodicReports is an array.
 *
 * @param {Map<string, Object>} [initialReports]
 * @param {Object[]} [initialPeriodicReports=[]]
 * @returns {import('./port.js').ReportsRepositoryFactory}
 */
export const createInMemoryReportsRepository = (
  initialReports = new Map(),
  initialPeriodicReports = []
) => {
  const reports = initialReports
  const periodicReports = initialPeriodicReports

  return () => ({
    createReport: (params) => createReport(reports, periodicReports, params),
    updateReport: (params) => updateReport(reports, params),
    deleteReport: (params) => deleteReport(reports, periodicReports, params),
    findReportById: (reportId) => findReportById(reports, reportId),
    findPeriodicReports: (params) =>
      findPeriodicReports(periodicReports, params)
  })
}
