import Boom from '@hapi/boom'
import Joi from 'joi'

import {
  ORGANISATION_NUMBER_PATTERN,
  REGISTRATION_NUMBER_PATTERN,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { servesOrganisationOn } from '#organisation-read-model/repository/to-read-model.js'
import { toCalendarDate } from '#common/helpers/date-formatter.js'

/**
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js'
 * @import { Organisation as ReadModelOrganisation, Registration as ReadModelRegistration } from '#organisation-read-model/domain/model.js'
 * @import { ManagedOrganisation, OrganisationLinkingRepository } from '#repositories/organisations/linking-port.js'
 *
 * @typedef {{ organisationNumber: OrganisationNumber }} OrganisationParams
 *
 * @typedef {OrganisationParams & { registrationNumber: RegistrationNumber }} RegistrationParams
 */

export const organisationPath = '/organisations/{organisationNumber}'
export const registrationPath = `${organisationPath}/registrations/{registrationNumber}`
export const accreditationPath = `${registrationPath}/accreditations/{year}`

export const organisationParams = {
  organisationNumber: Joi.string()
    .pattern(ORGANISATION_NUMBER_PATTERN)
    .custom(toOrganisationNumber)
    .required()
}
export const registrationParams = {
  ...organisationParams,
  registrationNumber: Joi.string()
    .pattern(REGISTRATION_NUMBER_PATTERN)
    .custom(toRegistrationNumber)
    .required()
}

/**
 * Finds the stored organisation a route names by its number. Only an
 * organisation the organisation read model serves can be found.
 *
 * @param {OrganisationLinkingRepository} organisationLinkingRepository
 * @param {OrganisationNumber} organisationNumber
 * @returns {Promise<ManagedOrganisation>}
 */
export async function findOrganisationByNumber(
  organisationLinkingRepository,
  organisationNumber
) {
  const organisation =
    await organisationLinkingRepository.findByOrganisationNumber(
      organisationNumber
    )
  if (
    !organisation ||
    !servesOrganisationOn(organisation, toCalendarDate(new Date()))
  ) {
    throw Boom.notFound('Organisation not found')
  }
  return organisation
}

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
