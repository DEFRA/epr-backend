import Boom from '@hapi/boom'

import { deriveAccreditationYear } from '#common/helpers/dates/accreditation.js'
import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'
import {
  SERVED_ACCREDITATION_STATUSES,
  SERVED_REGISTRATION_STATUSES
} from './organisation-view.js'

/**
 * @import { Accreditation } from '#domain/organisations/accreditation.js'
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 */

/**
 * Finds the stored registration a route names by its natural keys. Only a
 * registration the organisation read model serves can be found, so a link
 * built from the read model resolves and nothing else does.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {number} organisationNumber
 * @param {string} registrationNumber
 * @returns {Promise<{ organisation: Organisation, registration: Registration }>}
 */
export async function findRegistrationByNumber(
  organisationsRepository,
  organisationNumber,
  registrationNumber
) {
  const organisation =
    await organisationsRepository.findByOrgId(organisationNumber)
  if (!organisation) {
    throw Boom.notFound('Organisation not found')
  }

  const registration = onlyOne(
    organisation.registrations.filter(
      (candidate) =>
        candidate.registrationNumber === registrationNumber &&
        isOneOf(SERVED_REGISTRATION_STATUSES, candidate.status)
    ),
    'Registration'
  )

  return { organisation, registration }
}

/**
 * Finds a registration's accreditation for a year, the slot the accredited
 * routes address.
 *
 * @param {Organisation} organisation
 * @param {Registration} registration
 * @param {number} year
 * @returns {Accreditation}
 */
export function findAccreditationForYear(organisation, registration, year) {
  return onlyOne(
    accreditationsForRegistration(registration, organisation).filter(
      (candidate) =>
        candidate.accreditationNumber &&
        candidate.validFrom &&
        isOneOf(SERVED_ACCREDITATION_STATUSES, candidate.status) &&
        deriveAccreditationYear(candidate) === year
    ),
    'Accreditation'
  )
}

/**
 * A number shared by more than one record names none of them, as in the read
 * model.
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

/**
 * @param {readonly string[]} values
 * @param {string} value
 */
function isOneOf(values, value) {
  return values.includes(value)
}
