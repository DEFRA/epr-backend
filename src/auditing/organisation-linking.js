import { extractUserDetails, recordSystemLog, safeAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 * @import {OrganisationNumber} from '#domain/organisations/numbers.js'
 *
 * @typedef {{ organisationId: string, organisationNumber: OrganisationNumber }} AuditedOrganisation
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {AuditedOrganisation} organisation
 * @param {{ id: string, name: string }} linkedDefraOrganisation
 */
async function auditOrganisationLinking(
  request,
  { organisationId, organisationNumber },
  { id, name }
) {
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'linked-to-defra-id-organisation'
    },
    context: {
      organisationId,
      organisationNumber,
      linkedDefraOrganisation: { id, name }
    },
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {AuditedOrganisation} organisation
 * @param {{ id: string, name: string }} unlinkedDefraOrganisation
 */
async function auditOrganisationUnlinking(
  request,
  { organisationId, organisationNumber },
  { id, name }
) {
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'unlinked-from-defra-id-organisation'
    },
    context: {
      organisationId,
      organisationNumber,
      unlinkedDefraOrganisation: { id, name }
    },
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}
export { auditOrganisationLinking, auditOrganisationUnlinking }
