import { ROLES } from '#common/helpers/auth/constants.js'
import { getOrgDataFromDefraIdToken } from '#common/helpers/auth/roles/helpers.js'
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
 *   orgId: string | number
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
 * Get current Defra ID details from token.
 * Throws Boom.forbidden if the token has no current organisation.
 *
 * @param {*} auth
 * @param {object} logger
 * @returns {DefraOrgSummary}
 */
const getCurrentDetailsFromToken = (auth, logger) => {
  const orgInfo = getOrgDataFromDefraIdToken(auth.artifacts.decoded.payload)

  const currentOrg = orgInfo.find((org) => org.isCurrent)

  if (!currentOrg?.defraIdOrgId || !currentOrg?.defraIdOrgName) {
    const message = 'Token missing current organisation information'

    const { currentRelationshipId, relationships } =
      auth.artifacts.decoded.payload

    logger.warn({
      message,
      hasRelationships: Array.isArray(relationships),
      relationshipCount: Array.isArray(relationships)
        ? relationships.length
        : 0,
      hasCurrentRelationshipId: currentRelationshipId !== undefined,
      matchedCurrentOrg: false
    })

    throw Boom.forbidden(message)
  }

  return {
    id: currentOrg.defraIdOrgId,
    name: currentOrg.defraIdOrgName
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
    const { organisationsRepository, auth } = request

    const { email } = auth.credentials

    const current = getCurrentDetailsFromToken(auth, request.logger)

    const [linkedOrg, linkableOrgs] = await Promise.all([
      organisationsRepository.findByLinkedDefraOrgId(current.id),
      organisationsRepository.findAllLinkableForUser(email)
    ])

    const linked = linkedOrg?.linkedDefraOrganisation
      ? {
          id: linkedOrg.id,
          name: linkedOrg.linkedDefraOrganisation.orgName,
          orgId: linkedOrg.linkedDefraOrganisation.orgId,
          linkedBy: linkedOrg.linkedDefraOrganisation.linkedBy,
          linkedAt: linkedOrg.linkedDefraOrganisation.linkedAt
        }
      : null

    const unlinked = linkableOrgs.map((unlinkedOrg) => ({
      id: unlinkedOrg.id,
      name: unlinkedOrg.companyDetails.name,
      orgId: unlinkedOrg.orgId
    }))

    /** @type {{ organisations: UserOrganisationsResponse }} */
    const payload = { organisations: { current, linked, unlinked } }
    return h.response(payload).code(StatusCodes.OK)
  }
}
