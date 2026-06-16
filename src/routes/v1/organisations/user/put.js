import {
  addOrUpdateOrganisationUser,
  ORGANISATION_USER_RESULTS
} from '#common/helpers/auth/add-or-update-organisation-user.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { auditOrganisationUserAdded } from '#root/auditing/organisation-user.js'
import { StatusCodes } from 'http-status-codes'

export const organisationsUserPut = {
  method: 'PUT',
  path: '/v1/organisations/{organisationId}/user',
  options: {
    auth: { scope: [ROLES.standardUser] },
    tags: ['api']
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
   *   systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository,
   *   params: { organisationId: string }
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationId } = request.params
    const { organisationsRepository } = request
    const {
      decoded: { payload: tokenPayload }
    } = /** @type {import('#common/hapi-types.js').DefraIdArtifacts} */ (
      request.auth.artifacts
    )

    const organisation = await organisationsRepository.findById(organisationId)
    const result = await addOrUpdateOrganisationUser(
      request,
      tokenPayload,
      organisation
    )
    if (
      result.outcome === ORGANISATION_USER_RESULTS.USER_ADDED ||
      result.outcome === ORGANISATION_USER_RESULTS.USER_UPDATED
    ) {
      await auditOrganisationUserAdded(request, organisationId, result)
    }

    return h.response().code(StatusCodes.OK)
  }
}
