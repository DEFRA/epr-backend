/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {SystemLogsRepository} from '#repositories/system-logs/port.js' */
/** @import {DefraIdRelationship} from '#common/helpers/auth/types.js' */

import { extractUserDetails, recordSystemLog, safeAudit } from './helpers.js'

/**
 * @param {Organisation | null} linkedOrg
 * @returns {{ id: string, name: string, orgId: number, status: string, linkedBy: { email: string, id: string }, linkedAt: string } | null}
 */
function toAuditLinked(linkedOrg) {
  if (!linkedOrg?.linkedDefraOrganisation) {
    return null
  }

  return {
    id: linkedOrg.id,
    name: linkedOrg.linkedDefraOrganisation.orgName,
    orgId: linkedOrg.orgId,
    status: linkedOrg.status,
    linkedBy: linkedOrg.linkedDefraOrganisation.linkedBy,
    linkedAt: new Date(linkedOrg.linkedDefraOrganisation.linkedAt).toISOString()
  }
}

/**
 * @param {Organisation[]} linkableOrgs
 * @returns {Array<{ id: string, name: string, orgId: number, status: string }>}
 */
function toAuditUnlinked(linkableOrgs) {
  return linkableOrgs.map((org) => ({
    id: org.id,
    name: org.companyDetails.name,
    orgId: org.orgId,
    status: org.status
  }))
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & { systemLogsRepository: SystemLogsRepository }} request
 * @param {{
 *   defraIdOrg: { id: string; name: string }
 *   defraIdRelationships: DefraIdRelationship[]
 *   linkedOrg: Organisation | null
 *   linkableOrgs: Organisation[]
 * }} params
 */
export async function auditOrganisationsDiscovery(
  request,
  { defraIdOrg, defraIdRelationships, linkedOrg, linkableOrgs }
) {
  const linked = toAuditLinked(linkedOrg)
  const unlinked = toAuditUnlinked(linkableOrgs)

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
