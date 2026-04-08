import {
  extractUserDetails,
  isPayloadSmallEnoughToAudit,
  recordSystemLog,
  safeAudit
} from '#auditing/helpers.js'

const AUDIT_CATEGORY = 'waste-reporting'
const AUDIT_SUB_CATEGORY = 'reports'

/**
 * Audits a report status transition via CDP audit and system logs.
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository}} request
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.reportId
 * @param {object} params.previous
 * @param {object} params.next
 */
export async function auditReportStatusTransition(request, params) {
  const { organisationId, reportId, previous, next } = params

  const user = extractUserDetails(request)

  const payload = {
    event: {
      category: AUDIT_CATEGORY,
      subCategory: AUDIT_SUB_CATEGORY,
      action: 'status-transition'
    },
    context: { organisationId, reportId, previous, next },
    user
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: {
          organisationId,
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
 * @param {string} params.reportId
 * @param {object} params.previous
 */
export async function auditReportDelete(request, params) {
  const { organisationId, reportId, previous } = params

  const user = extractUserDetails(request)

  const payload = {
    event: {
      category: AUDIT_CATEGORY,
      subCategory: AUDIT_SUB_CATEGORY,
      action: 'delete'
    },
    context: { organisationId, reportId, previous },
    user
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: {
          organisationId,
          reportId,
          previous: { status: previous.status.currentStatus }
        }
      }

  safeAudit(safeAuditingPayload)
  await recordSystemLog(request, payload)
}

/**
 * Audits a report creation via CDP audit and system logs.
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository}} request
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {string} params.reportId
 * @param {string} params.createdAt
 * @param {number} params.year
 * @param {string} params.cadence
 * @param {number} params.period
 */
export async function auditReportCreate(request, params) {
  const {
    organisationId,
    registrationId,
    reportId,
    createdAt,
    year,
    cadence,
    period
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
      reportId,
      createdAt,
      year,
      cadence,
      period
    },
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}
