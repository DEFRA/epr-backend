import { ROLES } from '#common/helpers/auth/constants.js'
import {
  getOrgDataFromDefraIdToken,
  isInitialUser
} from '#common/helpers/auth/roles/helpers.js'
import { STATUS } from '#domain/organisations/model.js'
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
 *   orgId: string
 * }} EprOrganisationSummary
 */

/**
 * @typedef {DefraOrgSummary & {
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

const isNotALinkedOrg = () => (org) => !org.linkedDefraOrganisation
const isNotOurLinkedOrg = (linkedOrg) => (org) => org.id !== linkedOrg?.id
const isApproved = () => (org) => org.status === STATUS.APPROVED

/**
 * Get current Defra ID details from token
 *
 * @param {*} auth
 * @returns {DefraOrgSummary}
 */
const getCurrentDetailsFromToken = (auth) => {
  const orgInfo = getOrgDataFromDefraIdToken(auth.artifacts.decoded.payload)

  const currentOrg = orgInfo.find((org) => org.isCurrent)

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
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository, auth } = request

    const { email } = auth.credentials

    const current = getCurrentDetailsFromToken(auth)

    const allOrganisations = await organisationsRepository.findAll()

    const linkedOrg = allOrganisations.find(
      (org) => org.linkedDefraOrganisation?.orgId === current.id
    )

    const linked = linkedOrg
      ? {
          id: linkedOrg.linkedDefraOrganisation.orgId,
          name: linkedOrg.linkedDefraOrganisation.orgName,
          linkedBy: linkedOrg.linkedDefraOrganisation.linkedBy,
          linkedAt: linkedOrg.linkedDefraOrganisation.linkedAt
        }
      : null

    const unlinked = allOrganisations
      .filter(isNotALinkedOrg())
      .filter(isNotOurLinkedOrg(linkedOrg))
      .filter(isInitialUser(email))
      .filter(isApproved())
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
