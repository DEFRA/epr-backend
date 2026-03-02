import { extractUserDetails, recordSystemLog, safeAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {{url: string, generatedAt:String, expiresAt: string}} context
 */
async function auditPublicRegisterGenerate(request, context) {
  const user = extractUserDetails(request)
  const payload = {
    event: {
      category: 'public-register',
      subCategory: 'download',
      action: 'generate'
    },
    context,
    user
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}

export { auditPublicRegisterGenerate }
