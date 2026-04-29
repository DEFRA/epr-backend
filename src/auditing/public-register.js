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
  const event = {
    category: 'public-register',
    subCategory: 'download',
    action: 'generate'
  }

  safeAudit({ event, user }, () => context)
  await recordSystemLog(request, { event, context, user })
}

export { auditPublicRegisterGenerate }
