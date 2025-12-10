import { ROLES } from '#common/helpers/auth/constants.js'
import { getOrgDataFromDefraIdToken } from '#common/helpers/auth/roles/helpers.js'
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
 *   tradingName?: string
 *   companiesHouseNumber?: string
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
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository, auth } = request

    const { id: contactId, email } = auth.credentials

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
      .filter((org) => org.id !== linkedOrg?.id)
      .filter((org) =>
        org.users?.some(
          (user) => user.contactId === contactId || user.email === email
        )
      )
      .map((org) => ({
        id: org.id,
        name: org.companyDetails.name,
        tradingName: org.companyDetails.tradingName,
        companiesHouseNumber: org.companyDetails.companiesHouseNumber
      }))

    return h
      .response({ organisations: { current, linked, unlinked } })
      .code(StatusCodes.OK)
  }
}
