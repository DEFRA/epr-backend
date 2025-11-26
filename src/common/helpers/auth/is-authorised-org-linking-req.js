import { organisationsLinkPath } from '#domain/organisations/paths.js'
import { Boom } from '@hapi/boom'
import { isInitialUser } from './roles/helpers'

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
