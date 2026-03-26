import {
  extractUserDetails,
  recordSystemLog,
  safeAudit
} from '#auditing/helpers.js'

/**
 * Audits a report status transition via CDP audit and system logs.
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository}} request
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.reportId
 * @param {{ status: string, version: number }} params.previous
 * @param {{ status: string, version: number }} params.next
 */
export async function auditReportStatusTransition(request, params) {
  const { organisationId, reportId, previous, next } = params

  const user = extractUserDetails(request)

  const payload = {
    event: {
      category: 'reports',
      subCategory: 'status',
      action: 'status-transition'
    },
    context: {
      organisationId,
      reportId,
      previous,
      next
    },
    user
  }

  safeAudit(payload)

  await recordSystemLog(request, payload)
}
