import { ROLES } from '#common/helpers/auth/constants.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { organisationsLinkPath } from '#domain/organisations/paths.js'

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
  path: organisationsLinkPath,
  options: {
    auth: {
      scope: [ROLES.linker]
    }
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest & { params: { organisationId: string } }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    // TODO: `orgInToken`, `organisationId` and `organisation` are guaranteed to exist here
    // by the logic in `isAuthorisedOrgLinkingReq` which frontloads those checks.
    // It may make sense to move those checks into this handler

    const { orgInToken } = request.server.app

    const { organisationId } = request.params

    const { organisationsRepository } = request
    const {
      id,
      version: currentVersion,
      ...organisation
    } = await organisationsRepository.findById(organisationId)

    if (organisation?.status !== ORGANISATION_STATUS.APPROVED) {
      throw Boom.conflict('Organisation is not in an approvable state')
    }

    const linkedDefraOrg = {
      orgId: orgInToken.defraIdOrgId,
      orgName: orgInToken.defraIdOrgName,
      linkedBy: {
        email: request.auth.credentials.email,
        id: request.auth.credentials.id
      },
      linkedAt: new Date().toISOString()
    }

    await organisationsRepository.replace(id, currentVersion, {
      ...organisation,
      status: ORGANISATION_STATUS.ACTIVE,
      linkedDefraOrganisation: linkedDefraOrg
    })

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
