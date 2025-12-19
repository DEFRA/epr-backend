import { createPathRegex, PATH_PATTERNS } from '#common/helpers/path-pattern.js'
import { organisationsLinkPath } from '#domain/organisations/paths.js'
import Boom from '@hapi/boom'
import { isInitialUser } from './roles/helpers.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Checks if the request is an authorized organization linking request
 * @param {import('#common/hapi-types.js').HapiRequest} request - The Hapi request object
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload containing user and organization data
 * @returns {Promise<boolean>} True if the request is authorized, false otherwise
 */
export async function isAuthorisedOrgLinkingReq(request, tokenPayload) {
  const pathRegex = createPathRegex(organisationsLinkPath, {
    organisationId: PATH_PATTERNS.MONGO_OBJECT_ID
  })

  const isOrganisationLinkingRequest =
    pathRegex.test(request.path) && request.method === 'post'

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

  const isInitial = isInitialUser(email)(organisationById)

  if (!isInitial) {
    throw Boom.forbidden('user is not authorised to link organisation')
  }

  return true
}
