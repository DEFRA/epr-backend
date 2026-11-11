import {
  extractUserDetails,
  recordSystemLog,
  isPayloadSmallEnoughToAudit,
  safeAudit
} from './helpers.js'
import { toOrganisationWire } from '#common/helpers/organisation-wire.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 * @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {string} organisationId
 * @param {{ organisationNumber: OrganisationNumber }} previous
 * @param {{ organisationNumber: OrganisationNumber }} next
 * @param {{ registrationNumber?: RegistrationNumber | null, accreditationNumber?: AccreditationNumber | null }} [changed] - The numbers of the registration or accreditation the update changed
 */
async function auditOrganisationUpdate(
  request,
  organisationId,
  previous,
  next,
  changed = {}
) {
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'update'
    },
    context: {
      organisationId,
      organisationNumber: next.organisationNumber,
      ...changed,
      previous: toOrganisationWire(previous),
      next: toOrganisationWire(next)
    },
    user: extractUserDetails(request)
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: {
          organisationId,
          organisationNumber: next.organisationNumber,
          ...changed
        }
      }

  safeAudit(safeAuditingPayload)
  await recordSystemLog(request, payload)
}

export { auditOrganisationUpdate }
