import { audit } from '@defra/cdp-auditing'
import { extractUserDetails, recordSystemLog } from '#root/auditing/helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {{prnId: string, organisationId: string, accreditationId: string, previousStatus: string, newStatus: string}} context
 */
async function auditPrnStatusTransition(request, context) {
  const user = extractUserDetails(request)
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'packaging-recycling-note',
      action: 'status-transition'
    },
    context,
    user
  }

  audit(payload)
  await recordSystemLog(request, payload)
}

export { auditPrnStatusTransition }
