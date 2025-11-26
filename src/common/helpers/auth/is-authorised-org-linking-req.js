import { organisationsLinkPath } from '#domain/organisations/paths.js'
import Boom from '@hapi/boom'
import { isInitialUser } from './roles/helpers'

/**
 * Determines if a request is an authorised organisation linking request.
 *
 * Validates that:
 * 1. The request is a POST to the organisation linking endpoint
 * 2. The requesting user has an email in the token payload
 * 3. The organisation exists
 * 4. The user is the initial user for the organisation
 *
 * @param {import('#common/hapi-types.js').HapiRequest & {
 *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
 *   params: { organisationId: string },
 *   route: { path: string },
 *   method: string
 * }} request - The Hapi request object with organisation repository and route params
 * @param {Object} tokenPayload - The decoded JWT token payload
 * @param {string} [tokenPayload.email] - The email address from the token
 * @param {string} [tokenPayload.id] - The contact ID from the token
 * @param {string} [tokenPayload.iss] - The token issuer
 * @param {string} [tokenPayload.aud] - The token audience
 * @returns {Promise<boolean>} Returns true if this is an authorised organisation linking request, false otherwise
 * @throws {import('@hapi/boom').Boom} Throws 401 if email is missing, 404 if organisation not found, or 403 if user is not the initial user
 */
export async function isAuthorisedOrgLinkingReq(request, tokenPayload) {
  const isOrganisationLinkingRequest =
    request.route.path === organisationsLinkPath && request.method === 'post'

  if (!isOrganisationLinkingRequest) {
    return false
  }

  const { organisationId } = request.params
  const { organisationsRepository } = request
  const { email } = tokenPayload

  if (!email) {
    throw Boom.unauthorized('Email is required for organisation linking')
  }

  const organisationById =
    await organisationsRepository.findById(organisationId)

  if (!organisationById) {
    throw Boom.notFound('Organisation not found')
  }

  const isInitial = isInitialUser(organisationById, email)

  if (!isInitial) {
    throw Boom.forbidden('user is not authorised to link organisation')
  }

  return true
}
