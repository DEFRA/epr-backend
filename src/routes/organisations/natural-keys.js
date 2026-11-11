import Boom from '@hapi/boom'
import Joi from 'joi'

import {
  ORGANISATION_NUMBER_PATTERN,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'
import {
  servesOrganisationOn,
  toAccreditationEntry,
  toRegistrationEntry
} from '#organisation-read-model/repository/to-read-model.js'
import { toCalendarDate } from '#common/helpers/date-formatter.js'

/**
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { Accreditation } from '#domain/organisations/accreditation.js'
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js'
 * @import { Organisation as ReadModelOrganisation, Registration as ReadModelRegistration } from '#organisation-read-model/domain/model.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
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
 * @param {OrganisationsRepository} organisationsRepository
 * @param {OrganisationNumber} organisationNumber
 * @returns {Promise<Organisation>}
 */
export async function findOrganisationByNumber(
  organisationsRepository,
  organisationNumber
) {
  const organisation =
    await organisationsRepository.findByOrganisationNumber(organisationNumber)
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
 * @param {OrganisationsRepository} organisationsRepository
 * @param {OrganisationNumber} organisationNumber
 * @param {RegistrationNumber} registrationNumber
 * @returns {Promise<{ organisation: Organisation, registration: Registration }>}
 */
export async function findRegistrationByNumber(
  organisationsRepository,
  organisationNumber,
  registrationNumber
) {
  const organisation = await findOrganisationByNumber(
    organisationsRepository,
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

  const registration =
    organisation.registrations[request.params.registrationNumber]
  if (!registration) {
    throw Boom.notFound('Registration not found')
  }

  return { organisation, registration }
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
 * The registrations the organisation read model serves.
 *
 * @param {Organisation} organisation
 * @returns {Registration[]}
 */
export function servedRegistrations(organisation) {
  const numbers = new Set(
    organisation.registrations.flatMap(
      ({ registrationNumber }) => registrationNumber ?? []
    )
  )
  return [...numbers].flatMap(
    (number) => servedRegistrationByNumber(organisation, number) ?? []
  )
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

/**
 * A registration's stored accreditations for a year, by the read model's
 * rules.
 *
 * @param {Organisation} organisation
 * @param {Registration} registration
 * @param {Year} year
 * @returns {Accreditation[]}
 */
export function accreditationsForYear(organisation, registration, year) {
  return accreditationsForRegistration(registration, organisation).filter(
    (candidate) =>
      toAccreditationEntry(candidate, lookupContext())?.[0] === String(year)
  )
}

/**
 * Finds a registration's stored accreditation for a year, the slot the
 * accredited routes address, by the read model's rules.
 *
 * @param {Organisation} organisation
 * @param {Registration} registration
 * @param {Year} year
 * @returns {Accreditation}
 */
export function findAccreditationForYear(organisation, registration, year) {
  return onlyOne(
    accreditationsForYear(organisation, registration, year),
    'Accreditation'
  )
}

/**
 * A key shared by more than one served record names none of them, as in the
 * read model.
 *
 * @template T
 * @param {T[]} matches
 * @param {string} what
 * @returns {T}
 */
function onlyOne(matches, what) {
  const [match, ...others] = matches
  if (match === undefined || others.length > 0) {
    throw Boom.notFound(`${what} not found`)
  }
  return match
}
