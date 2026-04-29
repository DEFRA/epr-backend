import { extractUserDetails, recordSystemLog, safeAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {{summaryLogId: string, organisationId: string, registrationId: string}} context
 */
async function auditSummaryLogSubmit(request, context) {
  await auditSummaryLog(request, context, 'submit')
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {{summaryLogId: string, organisationId: string, registrationId: string}} context
 */
async function auditSummaryLogDownload(request, context) {
  await auditSummaryLog(request, context, 'download')
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {{summaryLogId: string, organisationId: string, registrationId: string}} context
 * @param {'upload' | 'submit' | 'download'} action
 */
async function auditSummaryLog(request, context, action) {
  const user = extractUserDetails(request)
  const event = {
    category: 'waste-reporting',
    subCategory: 'summary-log',
    action
  }

  safeAudit({ event, user }, () => context)
  await recordSystemLog(request, { event, context, user })
}

export { auditSummaryLogSubmit, auditSummaryLogDownload }
