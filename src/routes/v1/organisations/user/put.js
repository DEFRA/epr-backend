import {
  addOrUpdateOrganisationUser,
  ORGANISATION_USER_RESULTS
} from './add-or-update-organisation-user.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { auditOrganisationUserAdded } from './audit-organisation-user.js'
import { StatusCodes } from 'http-status-codes'

/**
 * Adds the user in the token to the organisation, or updates their details,
 * and responds with an empty body and `statusCode`.
 *
 * @param {number} statusCode
 */
export const putOrganisationUser =
  (statusCode) =>
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   params: { organisationId: string },
   *   app: import('#routes/organisations/by-natural-key.js').ResolvedRecords
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   */
  async (request, h) => {
    const { organisationId } = request.params
    const { organisationsRepository } = request
    const {
      decoded: { payload: tokenPayload }
    } = /** @type {import('#common/hapi-types.js').DefraIdArtifacts} */ (
      request.auth.artifacts
    )

    const organisation =
      request.app.organisation ??
      (await organisationsRepository.findById(organisationId))
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

    return h.response().code(statusCode)
  }

export const organisationsUserPut = {
  method: 'PUT',
  path: '/v1/organisations/{organisationId}/user',
  options: {
    auth: { scope: [SCOPES.organisationWrite] },
    tags: ['api']
  },
  handler: putOrganisationUser(StatusCodes.OK)
}
