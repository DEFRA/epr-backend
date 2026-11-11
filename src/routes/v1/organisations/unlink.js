import { SCOPES } from '#common/helpers/auth/constants.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { auditOrganisationUnlinking } from '#root/auditing/organisation-linking.js'
import { organisationLinkingMetrics } from '#common/helpers/metrics/organisation-linking.js'
import { findOrganisationReadModel } from '#routes/organisations/natural-keys.js'

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
   * @param {import('#routes/organisations/at-natural-keys.js').ResolvedRequest & {
   *    organisationLinkingRepository: import('#repositories/organisations/linking-port.js').OrganisationLinkingRepository,
   *    systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationLinkingRepository } = request
    const { organisationId, organisationNumber } = request.params
    const { version: currentVersion, linkedDefraOrganisation: linkedOrg } =
      await findOrganisationReadModel(request)

    if (!linkedOrg) {
      throw Boom.conflict('Organisation is not linked so cannot be unlinked')
    }

    await organisationLinkingRepository.unlinkDefraOrganisation(
      organisationNumber,
      currentVersion
    )

    await auditOrganisationUnlinking(request, organisationId, {
      id: linkedOrg.defraOrganisation.id,
      name: linkedOrg.defraOrganisation.name
    })
    await organisationLinkingMetrics.organisationUnlinked()

    return h.response().code(StatusCodes.NO_CONTENT)
  }
}
