/** @import {LinkedOrganisationSummary, OrganisationSummary} from '#repositories/organisations/linking-port.js' */
/** @import {DefraIdRelationship} from '#common/helpers/auth/types.js' */
/** @import {OrganisationNumber} from '#domain/organisations/numbers.js' */

import { toWireOrgId } from '#common/helpers/organisation-wire.js'
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
 *   organisationNumber: OrganisationNumber | null
 *   defraIdOrg: { id: string, name: string }
 *   defraIdRelationships: DefraIdRelationship[]
 *   linked: AuditLinkedOrg | null
 *   unlinked: AuditUnlinkedOrg[]
 * }} ReconciliationContext
 */

/**
 * @param {LinkedOrganisationSummary | null} linkedOrg
 * @returns {AuditLinkedOrg | null}
 */
function toAuditLinked(linkedOrg) {
  if (!linkedOrg?.linkedDefraOrganisation) {
    return null
  }

  return {
    id: linkedOrg.id,
    name: linkedOrg.linkedDefraOrganisation.orgName,
    orgId: toWireOrgId(linkedOrg.organisationNumber),
    status: linkedOrg.status,
    linkedBy: linkedOrg.linkedDefraOrganisation.linkedBy,
    linkedAt: new Date(linkedOrg.linkedDefraOrganisation.linkedAt).toISOString()
  }
}

/**
 * @param {OrganisationSummary[]} linkableOrgs
 * @returns {AuditUnlinkedOrg[]}
 */
function toAuditUnlinked(linkableOrgs) {
  return linkableOrgs.map((org) => ({
    id: org.id,
    name: org.companyDetails.name,
    orgId: toWireOrgId(org.organisationNumber),
    status: org.status
  }))
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest} request
 * @param {{
 *   defraIdOrg: { id: string; name: string }
 *   defraIdRelationships: DefraIdRelationship[]
 *   linkedOrg: LinkedOrganisationSummary | null
 *   linkableOrgs: OrganisationSummary[]
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
    organisationNumber:
      linked && linkedOrg ? linkedOrg.organisationNumber : null,
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
  const payload = {
    event: {
      category: 'identity',
      subCategory: 'defra-id-reconciliation',
      action: 'token-validation-failed'
    },
    context: {
      defraIdRelationships,
      error
    },
    user: extractUserDetails(request)
  }

  safeAudit(payload)
  await recordSystemLog(request, payload)
}
