import Boom from '@hapi/boom'
import Joi from 'joi'

import {
  ORGANISATION_NUMBER_PATTERN,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  servesOrganisationOn,
  toRegistrationEntry
} from '#organisation-read-model/repository/to-read-model.js'
import { toCalendarDate } from '#common/helpers/date-formatter.js'

/**
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js'
 * @import { Organisation as ReadModelOrganisation, Registration as ReadModelRegistration } from '#organisation-read-model/domain/model.js'
 * @import { OrganisationAdministrationRepository } from '#repositories/organisations/administration-port.js'
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
  registrationNumber: Joi.string().custom(toRegistrationNumber).required()
}

/**
 * Finding a record needs only its key. Overseas sites and the reasons a record
 * is not served matter to the view alone.
 */
const lookupContext = () => ({
  onDrop: () => {},
  overseasSitesById: new Map(),
  today: toCalendarDate(new Date())
})

/**
 * Finds the stored organisation a route names by its number. Only an
 * organisation the organisation read model serves can be found.
 *
 * @param {OrganisationAdministrationRepository} organisationAdministrationRepository
 * @param {OrganisationNumber} organisationNumber
 * @returns {Promise<Organisation>}
 */
export async function findOrganisationByNumber(
  organisationAdministrationRepository,
  organisationNumber
) {
  const organisation =
    await organisationAdministrationRepository.findByOrganisationNumber(
      organisationNumber
    )
  if (
    !organisation ||
    !servesOrganisationOn(organisation, lookupContext().today)
  ) {
    throw Boom.notFound('Organisation not found')
  }
  return organisation
}

/**
 * Finds the stored registration a route names by its natural keys. Only a
 * registration the organisation read model serves can be found, so a link
 * built from the read model resolves and nothing else does.
 *
 * @param {OrganisationAdministrationRepository} organisationAdministrationRepository
 * @param {OrganisationNumber} organisationNumber
 * @param {RegistrationNumber} registrationNumber
 * @returns {Promise<{ organisation: Organisation, registration: Registration }>}
 */
export async function findRegistrationByNumber(
  organisationAdministrationRepository,
  organisationNumber,
  registrationNumber
) {
  const organisation = await findOrganisationByNumber(
    organisationAdministrationRepository,
    organisationNumber
  )

  const registration = servedRegistrationByNumber(
    organisation,
    registrationNumber
  )
  if (!registration) {
    throw Boom.notFound('Registration not found')
  }

  return { organisation, registration }
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

/**
 * A number shared by more than one served registration names none of them.
 * Only registrations with the number are read, so a record the read model
 * cannot show elsewhere in the organisation does not stop the lookup.
 *
 * @param {Organisation} organisation
 * @param {RegistrationNumber} registrationNumber
 * @returns {Registration | null}
 */
function servedRegistrationByNumber(organisation, registrationNumber) {
  const served = organisation.registrations.filter(
    (candidate) =>
      candidate.registrationNumber === registrationNumber &&
      toRegistrationEntry(candidate, organisation, lookupContext()) !== null
  )
  return served.length === 1 ? served[0] : null
}
