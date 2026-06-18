import { ROLES } from '#auth/constants.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { auditOrganisationLinking } from '#root/auditing/organisation-linking.js'
import { organisationLinkingMetrics } from '#common/helpers/metrics/organisation-linking.js'
import { getDefraTokenSummary } from '#auth/roles/helpers.js'

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   linkedAt: string;
 *   linkedBy: {
 *     email: string
 *     id: string
 *   }
 * }} LinkedDefraOrganisationResponse
 */

/**
 * @typedef {Object} LinkedOrganisationResponse
 * @property {string} status
 * @property {LinkedDefraOrganisationResponse} linked
 */

export const organisationsLink = {
  method: 'POST',
  path: '/v1/organisations/{organisationId}/link',
  options: {
    auth: {
      scope: [ROLES.inquirer]
    },
    tags: ['api', 'admin']
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *    organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
   *    systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository,
   *    params: { organisationId: string }
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationId } = request.params
    const { organisationsRepository } = request
    const {
      decoded: { payload: tokenPayload }
    } = /** @type {import('#common/hapi-types.js').DefraIdArtifacts} */ (
      request.auth.artifacts
    )

    const { defraIdOrgId, defraIdOrgName } = getDefraTokenSummary(tokenPayload)

    if (!defraIdOrgId || !defraIdOrgName) {
      throw Boom.badRequest('Missing organisation information in user token')
    }

    // throws Boom.notFound if organisation does not exist
    const organisation = await organisationsRepository.findById(organisationId)

    const { id, version: currentVersion, ...organisationData } = organisation

    const { email, id: credentialId } =
      /** @type {import('#common/hapi-types.js').HumanCredentials} */ (
        request.auth.credentials
      )

    /**
     * repository only returns linkable orgs where
     * - the org is in an appropriate status (ie approved or active)
     * - the user (identified by email) is an initial user for this org
     * - the organisation is not already linked
     */
    const linkableOrganisations =
      await organisationsRepository.findAllLinkableForUser(tokenPayload.email)

    const orgToLink = linkableOrganisations.find(
      ({ id }) => id === organisation.id
    )

    if (!orgToLink) {
      // strictly this should 403 if the org is linkable but the user is not an initial user...
      // ...but that differentiation is embedded within findAllLinkableForUser
      throw Boom.conflict('Organisation is not in a linkable state')
    }

    const linkedDefraOrg = {
      orgId: defraIdOrgId,
      orgName: defraIdOrgName,
      linkedBy: {
        email,
        id: credentialId
      },
      linkedAt: new Date().toISOString()
    }

    await organisationsRepository.replace(id, currentVersion, {
      ...organisationData,
      status: ORGANISATION_STATUS.ACTIVE,
      linkedDefraOrganisation: linkedDefraOrg
    })

    await auditOrganisationLinking(request, id, {
      id: linkedDefraOrg.orgId,
      name: linkedDefraOrg.orgName
    })
    await organisationLinkingMetrics.organisationLinked()

    const updatedOrganisation = await organisationsRepository.findById(
      id,
      currentVersion + 1
    )

    /** @type {LinkedOrganisationResponse} */
    const payload = {
      status: updatedOrganisation.status,
      linked: {
        id: linkedDefraOrg.orgId,
        name: linkedDefraOrg.orgName,
        linkedAt: linkedDefraOrg.linkedAt,
        linkedBy: linkedDefraOrg.linkedBy
      }
    }

    return h.response(payload).code(StatusCodes.OK)
  }
}
