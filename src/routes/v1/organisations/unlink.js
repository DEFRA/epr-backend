import { SCOPES } from '#common/helpers/auth/constants.js'
import Boom from '@hapi/boom'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { StatusCodes } from 'http-status-codes'

import { auditOrganisationUnlinking } from '#root/auditing/organisation-linking.js'
import { organisationLinkingMetrics } from '#common/helpers/metrics/organisation-linking.js'

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
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *    organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
   *    systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository,
   *    app: import('#routes/organisations/at-natural-keys.js').ResolvedRecords
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const {
      id,
      orgId,
      version: currentVersion,
      linkedDefraOrganisation: linkedOrg
    } = request.app.organisation

    if (!linkedOrg) {
      throw Boom.conflict('Organisation is not linked so cannot be unlinked')
    }

    await organisationsRepository.unlinkDefraOrganisation(
      toOrganisationNumber(String(orgId)),
      currentVersion
    )

    await auditOrganisationUnlinking(request, id, {
      id: linkedOrg.orgId,
      name: linkedOrg.orgName
    })
    await organisationLinkingMetrics.organisationUnlinked()

    return h.response().code(StatusCodes.NO_CONTENT)
  }
}
