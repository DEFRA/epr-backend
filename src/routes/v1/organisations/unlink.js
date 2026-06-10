import { SCOPES } from '#common/helpers/auth/constants.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { organisationsLinkPath } from '#domain/organisations/paths.js'
import { auditOrganisationUnlinking } from '#root/auditing/organisation-linking.js'
import { organisationUnlinkingMetrics } from '#common/helpers/metrics/organisation-linking.js'

export const organisationsUnlink = {
  method: 'DELETE',
  path: organisationsLinkPath,
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
   *    params: { organisationId: string }
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   * @returns {Promise<import('@hapi/hapi').ResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationId } = request.params

    const { organisationsRepository } = request
    const {
      id,
      version: currentVersion,
      ...organisation
    } = await organisationsRepository.findById(organisationId)

    if (!organisation.linkedDefraOrganisation) {
      throw Boom.conflict('Organisation is not linked so cannot be unlinked')
    }

    const linkedOrg = organisation.linkedDefraOrganisation
    await organisationsRepository.replace(id, currentVersion, {
      ...organisation,
      linkedDefraOrganisation: undefined
    })

    await auditOrganisationUnlinking(request, id, {
      id: linkedOrg.orgId,
      name: linkedOrg.orgName
    })
    await organisationUnlinkingMetrics.organisationUnlinked()

    return h.response().code(StatusCodes.NO_CONTENT)
  }
}
