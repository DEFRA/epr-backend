import { ROLES } from '#common/helpers/auth/constants.js'
import { getOrgDataFromDefraIdToken } from '#common/helpers/auth/roles/helpers.js'
import {
  auditOrganisationsDiscovery,
  auditTokenValidationFailed
} from '#auditing/organisations-discovery.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

/**
 * @typedef {{
 *   id: string
 *   name: string
 * }} DefraOrgSummary
 */

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   orgId: number
 * }} EprOrganisationSummary
 */

/**
 * @typedef {EprOrganisationSummary & {
 *   linkedBy: {
 *     email: string
 *     id: string
 *   }
 *   linkedAt: string
 * }} LinkedDefraOrganisation
 */

/**
 * @typedef {{
 *   current: DefraOrgSummary
 *   linked: LinkedDefraOrganisation | null
 *   unlinked: EprOrganisationSummary[]
 * }} UserOrganisationsResponse
 */

export const organisationsLinkedGetAllPath = '/v1/me/organisations'

/**
 * Extract loggable organization info (org name and current flag)
 *
 * @param {import('#common/helpers/auth/types.js').DefraIdRelationship[]} orgInfo - Array of organization relationships
 * @returns {Array<{defraIdOrgName: string | undefined, isCurrent: boolean}>} Array of objects with defraIdOrgName and isCurrent
 */
const getLoggableOrgInfo = (orgInfo) =>
  orgInfo.map((org) => ({
    defraIdOrgName: org.defraIdOrgName,
    isCurrent: org.isCurrent
  }))

/**
 * Get current Defra ID details from token relationships
 *
 * @param {import('#common/helpers/auth/types.js').DefraIdRelationship[]} defraIdRelationships
 * @param {*} logger
 * @returns {DefraOrgSummary}
 */
const getCurrentDetailsFromToken = (defraIdRelationships, logger) => {
  const currentOrg = defraIdRelationships.find((org) => org.isCurrent)

  // Token should always have a current organisation
  if (!currentOrg?.defraIdOrgId || !currentOrg?.defraIdOrgName) {
    const loggableOrgInfo = getLoggableOrgInfo(defraIdRelationships)
    logger.warn({
      message: `User token missing organisation information. relationshipsCount: ${defraIdRelationships.length}, orgInfo: ${JSON.stringify(loggableOrgInfo)}`
    })

    throw Boom.forbidden(
      'User is not associated with any organisation. Please contact help desk.'
    )
  }

  return {
    id: currentOrg.defraIdOrgId,
    name: currentOrg.defraIdOrgName
  }
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest} request
 * @param {import('#common/helpers/auth/types.js').DefraIdRelationship[]} defraIdRelationships
 * @returns {Promise<DefraOrgSummary>}
 */
const tryGetCurrentDetailsFromToken = async (request, defraIdRelationships) => {
  const { logger } = request
  try {
    return getCurrentDetailsFromToken(defraIdRelationships, logger)
  } catch (err) {
    try {
      await auditTokenValidationFailed(request, {
        defraIdRelationships,
        error: /** @type {Error} */ (err).message
      })
    } catch (auditErr) {
      logger.error({
        message: `Failed to audit token validation failure: ${/** @type {Error} */ (auditErr).message}`
      })
    }
    throw err
  }
}

export const organisationsLinkedGetAll = {
  method: 'GET',
  path: organisationsLinkedGetAllPath,
  options: {
    auth: {
      scope: [ROLES.inquirer]
    },
    tags: ['api']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository, auth, logger } = request

    const { email } =
      /** @type {import('#common/hapi-types.js').HumanCredentials} */ (
        auth.credentials
      )

    const {
      decoded: { payload: tokenPayload }
    } = /** @type {import('#common/hapi-types.js').DefraIdArtifacts} */ (
      auth.artifacts
    )
    const defraIdRelationships = getOrgDataFromDefraIdToken(tokenPayload)

    const current = await tryGetCurrentDetailsFromToken(
      request,
      defraIdRelationships
    )

    const [linkedOrg, linkableOrgs] = await Promise.all([
      organisationsRepository.findByLinkedDefraOrgId(current.id),
      organisationsRepository.findAllLinkableForUser(email)
    ])

    const linked = linkedOrg?.linkedDefraOrganisation
      ? {
          id: linkedOrg.id,
          name: linkedOrg.linkedDefraOrganisation.orgName,
          orgId: linkedOrg.orgId,
          linkedBy: linkedOrg.linkedDefraOrganisation.linkedBy,
          linkedAt: linkedOrg.linkedDefraOrganisation.linkedAt
        }
      : null

    const unlinked = linkableOrgs.map((unlinkedOrg) => ({
      id: unlinkedOrg.id,
      name: unlinkedOrg.companyDetails.name,
      orgId: unlinkedOrg.orgId
    }))

    try {
      await auditOrganisationsDiscovery(request, {
        defraIdOrg: current,
        defraIdRelationships,
        linkedOrg,
        linkableOrgs
      })
    } catch (err) {
      logger.error({
        message: `Failed to audit organisations discovery: ${/** @type {Error} */ (err).message}`
      })
    }

    /** @type {{ organisations: UserOrganisationsResponse }} */
    const payload = { organisations: { current, linked, unlinked } }
    return h.response(payload).code(StatusCodes.OK)
  }
}
