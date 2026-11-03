/**
 * @import { AccreditationNumber, RequiredNumbers } from '#domain/organisations/numbers.js'
 * @import { OrganisationsRepository } from './port.js'
 */

/**
 * The database ids of the organisation, registration and accreditation that
 * `numbers` name, for an adapter whose store is still keyed on the ids. Null
 * when the organisation, or the registration or accreditation within it, is
 * not found.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {RequiredNumbers & { accreditationNumber: AccreditationNumber }} numbers
 * @returns {Promise<{ organisationId: string, registrationId: string, accreditationId: string } | null>}
 */
export const idsForNumbers = async (
  organisationsRepository,
  { organisationNumber, registrationNumber, accreditationNumber }
) => {
  const organisation =
    await organisationsRepository.findByOrganisationNumber(organisationNumber)
  if (!organisation) {
    return null
  }

  const registration = organisation.registrations.find(
    (candidate) => candidate.registrationNumber === registrationNumber
  )
  const accreditation = organisation.accreditations.find(
    (candidate) => candidate.accreditationNumber === accreditationNumber
  )
  return registration && accreditation
    ? {
        organisationId: organisation.id,
        registrationId: registration.id,
        accreditationId: accreditation.id
      }
    : null
}
