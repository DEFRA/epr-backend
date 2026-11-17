import Boom from '@hapi/boom'

/**
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { OrganisationParams, RegistrationParams } from '#organisations/index.js'
 * @import { Organisation as ReadModelOrganisation, Registration as ReadModelRegistration } from '#organisation-read-model/domain/model.js'
 */

/**
 * The organisation and registration the natural keys name, as the read model
 * shows them. Throws not found when the organisation does not hold the registration.
 *
 * @param {HapiRequest & { params: RegistrationParams }} request
 * @returns {Promise<{ organisation: ReadModelOrganisation, registration: ReadModelRegistration }>}
 */
export async function findOrganisationAndRegistrationReadModels(request) {
  const organisation = await findOrganisationReadModel(request)
  const { registrationNumber } = request.params

  if (!Object.hasOwn(organisation.registrations, registrationNumber)) {
    throw Boom.notFound('Registration not found')
  }

  return {
    organisation,
    registration: organisation.registrations[registrationNumber]
  }
}

/**
 * The organisation the natural key names, as the read model shows it.
 * Throws not found when no organisation found for supplied `params.organisationNumber`
 *
 * @param {HapiRequest & { params: OrganisationParams }} request
 * @returns {Promise<ReadModelOrganisation>}
 */
export async function findOrganisationReadModel({
  organisationReadRepository,
  params: { organisationNumber }
}) {
  const organisation =
    await organisationReadRepository.findByOrganisationNumber(
      organisationNumber
    )
  if (!organisation) {
    throw Boom.notFound('Organisation not found')
  }
  return organisation
}
