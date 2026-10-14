import Boom from '@hapi/boom'

import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'
import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import { approvedYears } from '#organisation-read-model/domain/status-timeline.js'
import {
  servesOrganisation,
  toAccreditationEntry,
  toRegistrationEntry,
  toStatusTimeline
} from '#organisation-read-model/repository/adapter.js'

/**
 * @import { Accreditation } from '#domain/organisations/accreditation.js'
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 */

/**
 * Finding a record needs only its key. Overseas sites and the reasons a record
 * is not served matter to the view alone.
 */
const lookupContext = () => ({
  onDrop: () => {},
  overseasSitesById: new Map(),
  today: new Date().toISOString().slice(0, 10)
})

/**
 * Finds the stored organisation a route names by its number. Only an
 * organisation the organisation read model serves can be found.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {number} organisationNumber
 * @returns {Promise<Organisation>}
 */
export async function findOrganisationByNumber(
  organisationsRepository,
  organisationNumber
) {
  const organisation =
    await organisationsRepository.findByOrgId(organisationNumber)
  if (
    !organisation ||
    !servesOrganisation(organisation, lookupContext().today)
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
 * @param {number} organisationNumber
 * @param {string} registrationNumber
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
 * The registrations the organisation read model serves.
 *
 * @param {Organisation} organisation
 * @returns {Registration[]}
 */
export function servedRegistrations(organisation) {
  const numbers = new Set(
    organisation.registrations.map(
      ({ registrationNumber }) => registrationNumber
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
 * @param {string | null | undefined} registrationNumber
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
 * The years the registration was approved in, up to this year.
 *
 * @param {Registration} registration
 * @returns {number[]}
 */
export function registrationYears(registration) {
  return approvedYears(
    toStatusTimeline(registration.statusHistory),
    utcCalendarDate(new Date())
  )
}

/**
 * A registration's accreditations for a year, by the read model's rules.
 *
 * @param {Organisation} organisation
 * @param {Registration} registration
 * @param {number} year
 * @returns {Accreditation[]}
 */
export function accreditationsForYear(organisation, registration, year) {
  return accreditationsForRegistration(registration, organisation).filter(
    (candidate) =>
      toAccreditationEntry(candidate, lookupContext())?.[0] === String(year)
  )
}

/**
 * Finds a registration's accreditation for a year, the slot the accredited
 * routes address, by the read model's rules.
 *
 * @param {Organisation} organisation
 * @param {Registration} registration
 * @param {number} year
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
