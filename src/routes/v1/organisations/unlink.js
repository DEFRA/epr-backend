import { SCOPES } from '#common/helpers/auth/constants.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { auditOrganisationUnlinking } from '#root/auditing/organisation-linking.js'
import { organisationLinkingMetrics } from '#common/helpers/metrics/organisation-linking.js'

/** @import { ResolvedRecords, ResolvedRequest } from '#routes/organisations/at-natural-keys.js' */

/**
 * Removes the link between the organisation and its Defra ID organisation.
 */
export const organisationsUnlink = {
  method: 'DELETE',
  options: {
    auth: {
      scope: [SCOPES.adminWrite]
    },
    tags: ['api', 'admin']
  },

  /**
   * @param {ResolvedRequest & { app: ResolvedRecords }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const { organisationId, organisationNumber } = request.params
    const { version: currentVersion, linkedDefraOrganisation: linkedOrg } =
      request.app.storedOrganisation

    if (!linkedOrg) {
      throw Boom.conflict('Organisation is not linked so cannot be unlinked')
    }

    await organisationsRepository.unlinkDefraOrganisation(
      organisationNumber,
      currentVersion
    )

    await auditOrganisationUnlinking(
      request,
      { organisationId, organisationNumber },
      { id: linkedOrg.orgId, name: linkedOrg.orgName }
    )
    await organisationLinkingMetrics.organisationUnlinked()

    return h.response().code(StatusCodes.NO_CONTENT)
  }
}
