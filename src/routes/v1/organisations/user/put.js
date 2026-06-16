import { addOrUpdateOrganisationUser } from '#common/helpers/auth/add-or-update-organisation-user.js'
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
    await addOrUpdateOrganisationUser(request, tokenPayload, organisation)
    await auditOrganisationUserAdded(request, organisationId)

    return h.response().code(StatusCodes.OK)
  }
}
