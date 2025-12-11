import { ROLES } from '#common/helpers/auth/constants.js'
import {
  getOrgDataFromDefraIdToken,
  isInitialUser
} from '#common/helpers/auth/roles/helpers.js'
import { StatusCodes } from 'http-status-codes'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   relationshipId: string
 * }} DefraOrgSummary
 */

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   orgId: string
 * }} EprOrganisationSummary
 */

/**
 * @typedef {{
 *   id: string
 *   name: string
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

const isNotLinkedOrg = (linkedOrg) => (org) => org.id !== linkedOrg?.id

export const organisationsLinkedGetAll = {
  method: 'GET',
  path: organisationsLinkedGetAllPath,
  options: {
    auth: {
      scope: [ROLES.inquirer]
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject & { organisations: UserOrganisationsResponse }>}
   */
  handler: async (request, h) => {
    const { organisationsRepository, auth } = request

    const { email } = auth.credentials

    const orgInfo = getOrgDataFromDefraIdToken(auth.artifacts.decoded.payload)

    // Get the user's current organisation from the token
    const currentOrgFromToken = orgInfo.find((org) => org.isCurrent)

    const current = {
      id: currentOrgFromToken.defraIdOrgId,
      name: currentOrgFromToken.defraIdOrgName,
      relationshipId: currentOrgFromToken.defraIdRelationshipId
    }

    const allOrganisations = await organisationsRepository.findAll()

    // Get linked organisation details if a link exists
    const linkedOrg = allOrganisations.find(
      (org) =>
        org.linkedDefraOrganisation?.orgId ===
        currentOrgFromToken.defraIdRelationshipId
    )

    const linked = linkedOrg
      ? {
          id: linkedOrg.linkedDefraOrganisation.orgId,
          name: linkedOrg.linkedDefraOrganisation.orgName,
          linkedBy: linkedOrg.linkedDefraOrganisation.linkedBy,
          linkedAt: linkedOrg.linkedDefraOrganisation.linkedAt
        }
      : null

    // Unlinked are all other organisations (excluding the current linked one)
    const unlinked = allOrganisations
      .filter(isNotLinkedOrg(linkedOrg))
      .filter(isInitialUser(email))
      .map((org) => ({
        id: org.id,
        name: org.companyDetails.name,
        orgId: org.orgId
      }))

    /** @type {{ organisations: UserOrganisationsResponse }} */
    const payload = { organisations: { current, linked, unlinked } }
    return h.response(payload).code(StatusCodes.OK)
  }
}
