import {
  extractUserDetails,
  isPayloadSmallEnoughToAudit,
  recordSystemLog,
  recordSystemLogs,
  safeAudit
} from '#auditing/helpers.js'

/** @type {import('#repositories/system-logs/port.js').SystemLog['createdBy']} */
const SYSTEM_ACTOR = Object.freeze({ id: 'system', email: 'system', scope: [] })

const AUDIT_CATEGORY = 'waste-reporting'
const AUDIT_SUB_CATEGORY = 'reports'

/**
 * Audits a report status transition via CDP audit and system logs.
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository}} request
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {number} params.year
 * @param {string} params.cadence
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @param {string} params.reportId
 * @param {object} params.previous
 * @param {object} params.next
 */
export async function auditReportStatusTransition(request, params) {
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber,
    reportId,
    previous,
    next
  } = params

  const user = extractUserDetails(request)

  const payload = {
    event: {
      category: AUDIT_CATEGORY,
      subCategory: AUDIT_SUB_CATEGORY,
      action: 'status-transition'
    },
    context: {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber,
      reportId,
      previous,
      next
    },
    user
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: {
          organisationId,
          registrationId,
          year,
          cadence,
          period,
          submissionNumber,
          reportId,
          previous: { status: previous.status.currentStatus },
          next: { status: next.status.currentStatus }
        }
      }

  safeAudit(safeAuditingPayload)

  await recordSystemLog(request, payload)
}

/**
 * Audits a report deletion via CDP audit and system logs.
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository}} request
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {number} params.year
 * @param {string} params.cadence
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @param {string} params.reportId
 * @param {object} params.previous
 */
export async function auditReportDelete(request, params) {
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber,
    reportId,
    previous
  } = params

  const user = extractUserDetails(request)

  const payload = {
    event: {
      category: AUDIT_CATEGORY,
      subCategory: AUDIT_SUB_CATEGORY,
      action: 'delete'
    },
    context: {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber,
      reportId,
      previous
    },
    user
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: {
          organisationId,
          registrationId,
          year,
          cadence,
          period,
          submissionNumber,
          reportId,
          previous: { status: previous.status.currentStatus }
        }
      }

  safeAudit(safeAuditingPayload)
  await recordSystemLog(request, payload)
}

/**
 * Audits a bulk markActiveReportsStale operation via CDP audit and system logs.
 * Emits one CDP audit event and one system-log record per report.
 * Uses {@link recordSystemLogs} for a single DB round-trip across all records.
 * @param {{
 *   systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   reportsMarkedStale: import('#reports/repository/port.js').MarkReportStaleResult[]
 * }} params
 */
export async function auditMarkReportsStale({
  systemLogsRepository,
  organisationId,
  registrationId,
  reportsMarkedStale
}) {
  const payloads = reportsMarkedStale.map(
    ({ reportId, year, cadence, period, submissionNumber, stale }) => ({
      user: SYSTEM_ACTOR,
      event: {
        category: AUDIT_CATEGORY,
        subCategory: AUDIT_SUB_CATEGORY,
        action: 'mark-stale'
      },
      context: {
        organisationId,
        registrationId,
        year,
        cadence,
        period,
        submissionNumber,
        reportId,
        previous: { stale: null },
        next: { stale }
      }
    })
  )

  payloads.forEach((p) => safeAudit(p))
  await recordSystemLogs(systemLogsRepository, payloads)
}

/**
 * Audits a report creation via CDP audit and system logs.
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository}} request
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {number} params.year
 * @param {string} params.cadence
 * @param {number} params.period
 * @param {number} params.submissionNumber
 * @param {string} params.reportId
 * @param {string} params.createdAt
 */
export async function auditReportCreate(request, params) {
  const {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber,
    reportId,
    createdAt
  } = params

  const payload = {
    event: {
      category: AUDIT_CATEGORY,
      subCategory: AUDIT_SUB_CATEGORY,
      action: 'create'
    },
    context: {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber,
      reportId,
      createdAt
    },
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}
