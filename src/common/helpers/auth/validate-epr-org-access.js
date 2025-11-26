import Boom from '@hapi/boom'

export const validateEprOrganisationAccess = (request, linkedEprOg) => {
  const { organisationId } = request.params

  if (!organisationId) {
    throw Boom.forbidden('Organisation ID is required in the request')
  }

  if (organisationId !== linkedEprOg) {
    throw Boom.forbidden('Access denied: organisation mismatch')
  }
}
