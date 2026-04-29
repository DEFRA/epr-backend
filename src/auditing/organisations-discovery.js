/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {DefraIdRelationship} from '#common/helpers/auth/types.js' */

import { extractUserDetails, recordSystemLog, safeAudit } from './helpers.js'

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   orgId: number
 *   status: string
 * }} AuditUnlinkedOrg
 */

/**
 * @typedef {AuditUnlinkedOrg & {
 *   linkedBy: { email: string, id: string }
 *   linkedAt: string
 * }} AuditLinkedOrg
 */

/**
 * @typedef {{
 *   organisationId: string | null
 *   defraIdOrg: { id: string, name: string }
 *   defraIdRelationships: DefraIdRelationship[]
 *   linked: AuditLinkedOrg | null
 *   unlinked: AuditUnlinkedOrg[]
 * }} ReconciliationContext
 */

/**
 * @param {Organisation | null} linkedOrg
 * @returns {AuditLinkedOrg | null}
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
 * @returns {AuditUnlinkedOrg[]}
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
 * @param {import('#common/hapi-types.js').HapiRequest} request
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

  /** @type {ReconciliationContext} */
  const context = {
    organisationId: linked?.id ?? null,
    defraIdOrg,
    defraIdRelationships,
    linked,
    unlinked
  }

  const event = {
    category: 'identity',
    subCategory: 'defra-id-reconciliation',
    action: 'organisations-discovered'
  }
  const user = extractUserDetails(request)

  safeAudit({ event, user }, () => ({
    organisationId: linked?.id ?? null,
    defraIdOrg
  }))
  await recordSystemLog(request, { event, context, user })
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest} request
 * @param {{
 *   defraIdRelationships: DefraIdRelationship[]
 *   error: string
 * }} params
 */
export async function auditTokenValidationFailed(
  request,
  { defraIdRelationships, error }
) {
  const event = {
    category: 'identity',
    subCategory: 'defra-id-reconciliation',
    action: 'token-validation-failed'
  }
  const user = extractUserDetails(request)
  const context = { defraIdRelationships, error }

  safeAudit({ event, user }, () => context)
  await recordSystemLog(request, { event, context, user })
}
