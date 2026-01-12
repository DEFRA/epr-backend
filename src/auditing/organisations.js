import { audit } from '@defra/cdp-auditing'
import { config } from '#root/config.js'
import { extractUserDetails, recordSystemLog } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {string} organisationId
 * @param {Object} previous
 * @param {Object} next
 */
async function auditOrganisationUpdate(
  request,
  organisationId,
  previous,
  next
) {
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'update'
    },
    context: {
      organisationId,
      previous,
      next
    },
    user: extractUserDetails(request)
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: { organisationId }
      }

  audit(safeAuditingPayload)
  await recordSystemLog(request, payload)
}

// Prevent sending large auditing payloads to CDP library (as this causes an error and the audit event is lost)
function isPayloadSmallEnoughToAudit(payload) {
  const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8')
  return payloadSize < config.get('audit.maxPayloadSizeBytes')
}

export { auditOrganisationUpdate }
