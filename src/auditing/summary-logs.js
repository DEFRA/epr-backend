import {
  SUMMARY_LOG_SUB_CATEGORY,
  SUMMARY_LOG_SUBMIT_ACTION
} from '#system-logs/index.js'
import { extractUserDetails, recordSystemLog, safeAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#system-logs/index.js'
 * @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js'
 *
 * @typedef {{
 *   summaryLogId: string
 *   organisationNumber: OrganisationNumber
 *   registrationNumber: RegistrationNumber
 *   accreditationNumber: AccreditationNumber | null | undefined
 * }} SummaryLogAuditContext
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {SummaryLogAuditContext} context
 */
async function auditSummaryLogSubmit(request, context) {
  await auditSummaryLog(request, context, SUMMARY_LOG_SUBMIT_ACTION)
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {SummaryLogAuditContext} context
 */
async function auditSummaryLogDownload(request, context) {
  await auditSummaryLog(request, context, 'download')
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {SummaryLogAuditContext} context
 * @param {'upload' | 'submit' | 'download'} action
 */
async function auditSummaryLog(request, context, action) {
  const user = extractUserDetails(request)
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: SUMMARY_LOG_SUB_CATEGORY,
      action
    },
    context,
    user
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}

export { auditSummaryLogSubmit, auditSummaryLogDownload }
