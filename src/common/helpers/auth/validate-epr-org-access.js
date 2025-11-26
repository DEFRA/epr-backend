import Boom from '@hapi/boom'

export const validateEprOrganisationAccess = (request, linkedEprOg) => {
  const isDiscoveryRequest =
    request.route.path === '/organisations' && request.method === 'get'

  // When path is /organisation/link and method is POST
  const isOrganisationLinkingRequest =
    request.route.path === '/organisations/link' && request.method === 'post'

  // Organisation
  const { organisationId } = request.params

  if (!organisationId && !isDiscoveryRequest && !isOrganisationLinkingRequest) {
    throw Boom.forbidden('Organisation ID is required in the request')
  }

  if (organisationId && organisationId !== linkedEprOg) {
    throw Boom.forbidden('Access denied: organisation mismatch')
  }
}
