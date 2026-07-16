import {
  extractUserDetails,
  isPayloadSmallEnoughToAudit,
  recordSystemLog,
  recordSystemLogs,
  safeAudit
} from '#auditing/helpers.js'

/**
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 * @import {
 *   MarkReportStaleResult,
 *   MarkSubmittedReportRequiringResubmissionResult
 * } from '#reports/repository/port.js'
 */

/** @type {import('#repositories/system-logs/port.js').SystemLog['createdBy']} */
const SYSTEM_ACTOR = Object.freeze({
  id: 'system',
  email: 'system',
  scope: [],
  role: null
})

const AUDIT_CATEGORY = 'waste-reporting'
const AUDIT_SUB_CATEGORY = 'reports'

/**
 * `action` values for {@link auditMarkReportsStale}'s two callers — both
 * target the report's `stale` field, distinguished only by which trigger
 * fired.
 */
export const MARK_STALE_ACTION = Object.freeze({
  SUMMARY_LOG_CHANGED: 'mark-stale-sl-upload',
  PRN_CANCELLED: 'mark-stale-prn-cancelled'
})

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
 * Audits a bulk report-flag transition (mark-stale / mark-requiring-resubmission)
 * via CDP audit and system logs. Emits one CDP audit event and one system-log
 * record per report, in a single DB round-trip.
 * @param {{
 *   systemLogsRepository: SystemLogsRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   action: string,
 *   field: string,
 *   results: Array<MarkReportStaleResult | MarkSubmittedReportRequiringResubmissionResult>
 * }} params
 */
async function auditReportFlagTransition({
  systemLogsRepository,
  organisationId,
  registrationId,
  action,
  field,
  results
}) {
  const payloads = results.map((result) => ({
    user: SYSTEM_ACTOR,
    event: {
      category: AUDIT_CATEGORY,
      subCategory: AUDIT_SUB_CATEGORY,
      action
    },
    context: {
      organisationId,
      registrationId,
      year: result.year,
      cadence: result.cadence,
      period: result.period,
      submissionNumber: result.submissionNumber,
      reportId: result.reportId,
      previous: { [field]: null },
      next: { [field]: /** @type {Record<string, unknown>} */ (result)[field] }
    }
  }))

  payloads.forEach((p) => safeAudit(p))
  await recordSystemLogs(systemLogsRepository, payloads)
}

/**
 * Audits a bulk mark-stale operation against the report's `stale` field.
 * `action` (one of {@link MARK_STALE_ACTION}) distinguishes which trigger
 * fired: `MARK_STALE_ACTION.SUMMARY_LOG_CHANGED` with `reportsMarkedStale[].stale`
 * set to `{ summaryLogChanged }`; `MARK_STALE_ACTION.PRN_CANCELLED` with
 * `reportsMarkedStale[].stale` set to `{ prnCancelled }`. Each result's
 * `stale` already carries only the sub-key that trigger set (never both), so
 * the audit payload naturally records just what changed.
 * @param {{
 *   systemLogsRepository: SystemLogsRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   reportsMarkedStale: MarkReportStaleResult[],
 *   action: string
 * }} params
 */
export async function auditMarkReportsStale({
  systemLogsRepository,
  organisationId,
  registrationId,
  reportsMarkedStale,
  action
}) {
  await auditReportFlagTransition({
    systemLogsRepository,
    organisationId,
    registrationId,
    action,
    field: 'stale',
    results: reportsMarkedStale
  })
}

/**
 * Audits a bulk markSubmittedReportsRequiringResubmission operation.
 * @param {{
 *   systemLogsRepository: SystemLogsRepository,
 *   organisationId: string,
 *   registrationId: string,
 *   reportsRequiringResubmission: MarkSubmittedReportRequiringResubmissionResult[]
 * }} params
 */
export async function auditMarkReportsRequiringResubmission({
  systemLogsRepository,
  organisationId,
  registrationId,
  reportsRequiringResubmission
}) {
  await auditReportFlagTransition({
    systemLogsRepository,
    organisationId,
    registrationId,
    action: 'mark-requiring-resubmission',
    field: 'resubmissionRequired',
    results: reportsRequiringResubmission
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
