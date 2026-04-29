import {
  extractUserDetails,
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

  const event = {
    category: AUDIT_CATEGORY,
    subCategory: AUDIT_SUB_CATEGORY,
    action: 'status-transition'
  }

  safeAudit({ event, user }, () => ({
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber,
    reportId,
    previous: { status: previous.status.currentStatus },
    next: { status: next.status.currentStatus }
  }))

  await recordSystemLog(request, {
    event,
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
  })
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

  const event = {
    category: AUDIT_CATEGORY,
    subCategory: AUDIT_SUB_CATEGORY,
    action: 'delete'
  }

  safeAudit({ event, user }, () => ({
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber,
    reportId,
    previous: { status: previous.status.currentStatus }
  }))

  await recordSystemLog(request, {
    event,
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
  })
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

  const event = {
    category: AUDIT_CATEGORY,
    subCategory: AUDIT_SUB_CATEGORY,
    action: 'create'
  }
  const user = extractUserDetails(request)
  const context = {
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    submissionNumber,
    reportId,
    createdAt
  }

  safeAudit({ event, user }, () => context)
  await recordSystemLog(request, { event, context, user })
}
