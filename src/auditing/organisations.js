import {
  extractUserDetails,
  recordSystemLog,
  isPayloadSmallEnoughToAudit,
  safeAudit
} from './helpers.js'
import { toOrganisationWire } from '#common/helpers/organisation-wire.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 * @import {OrganisationNumber} from '#domain/organisations/numbers.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {string} organisationId
 * @param {{ organisationNumber: OrganisationNumber }} previous
 * @param {{ organisationNumber: OrganisationNumber }} next
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
      previous: toOrganisationWire(previous),
      next: toOrganisationWire(next)
    },
    user: extractUserDetails(request)
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: { organisationId }
      }

  safeAudit(safeAuditingPayload)
  await recordSystemLog(request, payload)
}

export { auditOrganisationUpdate }
