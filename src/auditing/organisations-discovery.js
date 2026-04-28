/** @import {SystemLogsRepository} from '#repositories/system-logs/port.js' */
/** @import {DefraIdRelationship} from '#common/helpers/auth/types.js' */

import { extractUserDetails, recordSystemLog, safeAudit } from './helpers.js'

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   orgId: number
 *   status: string
 *   linkedBy: { email: string; id: string }
 *   linkedAt: string
 * }} AuditLinkedOrg
 */

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   orgId: number
 *   status: string
 * }} AuditUnlinkedOrg
 */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & { systemLogsRepository: SystemLogsRepository }} request
 * @param {{
 *   defraIdOrg: { id: string; name: string }
 *   defraIdRelationships: DefraIdRelationship[]
 *   linked: AuditLinkedOrg | null
 *   unlinked: AuditUnlinkedOrg[]
 * }} params
 */
export async function auditOrganisationsDiscovery(
  request,
  { defraIdOrg, defraIdRelationships, linked, unlinked }
) {
  const context = {
    organisationId: linked?.id ?? null,
    defraIdOrg,
    defraIdRelationships,
    linked,
    unlinked
  }

  const payload = {
    event: {
      category: 'identity',
      subCategory: 'defra-id-reconciliation',
      action: 'organisations-discovered'
    },
    context,
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}
