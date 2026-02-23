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
  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'linked-to-defra-id-organisation'
    },
    context: {
      organisationId,
      linkedDefraOrganisation: { id, name }
    },
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}

export { auditOrganisationLinking }
