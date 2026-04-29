import { extractUserDetails, recordSystemLog, safeAudit } from './helpers.js'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
 * @param {string} organisationId
 * @param {{ id: string, name: string }} linkedDefraOrganisation
 */
async function auditOrganisationLinking(request, organisationId, { id, name }) {
  const event = {
    category: 'entity',
    subCategory: 'epr-organisations',
    action: 'linked-to-defra-id-organisation'
  }
  const user = extractUserDetails(request)
  const context = {
    organisationId,
    linkedDefraOrganisation: { id, name }
  }

  safeAudit({ event, user }, () => context)
  await recordSystemLog(request, { event, context, user })
}

export { auditOrganisationLinking }
