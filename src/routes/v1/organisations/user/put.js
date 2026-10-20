import {
  addOrUpdateOrganisationUser,
  ORGANISATION_USER_RESULTS
} from './add-or-update-organisation-user.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { auditOrganisationUserAdded } from './audit-organisation-user.js'
import { StatusCodes } from 'http-status-codes'

/**
 * Adds the user in the token to the organisation, or updates their details.
 */
export const organisationsUserPut = {
  method: 'PUT',
  options: {
    auth: { scope: [SCOPES.organisationWrite] },
    tags: ['api'],
    response: { schema: false }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   params: { organisationId: string },
   *   app: import('#routes/organisations/at-natural-keys.js').ResolvedRecords
   * }} request
   * @param {import('@hapi/hapi').ResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationId } = request.params
    const {
      decoded: { payload: tokenPayload }
    } = /** @type {import('#common/hapi-types.js').DefraIdArtifacts} */ (
      request.auth.artifacts
    )

    const result = await addOrUpdateOrganisationUser(
      request,
      tokenPayload,
      request.app.organisation
    )

    if (
      result.outcome === ORGANISATION_USER_RESULTS.USER_ADDED ||
      result.outcome === ORGANISATION_USER_RESULTS.USER_UPDATED
    ) {
      await auditOrganisationUserAdded(request, organisationId, result)
    }

    return h.response().code(StatusCodes.NO_CONTENT)
  }
}
