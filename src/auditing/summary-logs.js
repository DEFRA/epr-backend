import { audit } from '@defra/cdp-auditing'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {{summaryLogId: string, organisationId: string, registrationId: string}} context
 */
async function auditSummaryLogUpload(request, context) {
  await auditSummaryLog(request, context, 'upload')
}

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
 * @param {'upload' | 'submit'} action
 */
async function auditSummaryLog(request, context, action) {
  const user = extractUserDetails(request)
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'summary-log',
      action
    },
    context,
    user
  }

  audit(payload)
  await recordSystemLog(request, payload)
}

function extractUserDetails(request) {
  return {
    id: request.auth?.credentials?.id,
    email: request.auth?.credentials?.email,
    scope: request.auth?.credentials?.scope
  }
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {object} payload
 */
async function recordSystemLog(request, { user, ...restPayload }) {
  if (!request.systemLogsRepository) {
    return
  }

  return request.systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: user,
    ...restPayload
  })
}

export { auditSummaryLogUpload, auditSummaryLogSubmit }
