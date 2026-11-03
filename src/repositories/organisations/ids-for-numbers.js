/**
 * @import { RequiredNumbers } from '#domain/organisations/numbers.js'
 * @import { RegistrationOrAccreditationId } from '#waste-balances/repository/ledger-schema.js'
 * @import { OrganisationsRepository } from './port.js'
 */

/**
 * The database ids of the organisation, registration and accreditation that
 * `numbers` name, for an adapter whose store is still keyed on the ids. Null
 * when the organisation, or the registration or accreditation within it, is
 * not found.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {RequiredNumbers} numbers
 * @returns {Promise<RegistrationOrAccreditationId | null>}
 */
export const idsForNumbers = async (
  organisationsRepository,
  { organisationNumber, registrationNumber, accreditationNumber }
) => {
  const organisation =
    await organisationsRepository.findByOrganisationNumber(organisationNumber)
  const registration = organisation?.registrations.find(
    (candidate) => candidate.registrationNumber === registrationNumber
  )
  if (!organisation || !registration) {
    return null
  }

  const ids = {
    organisationId: organisation.id,
    registrationId: registration.id
  }
  if (accreditationNumber === null) {
    return { ...ids, accreditationId: null }
  }

  const accreditation = organisation.accreditations.find(
    (candidate) => candidate.accreditationNumber === accreditationNumber
  )
  return accreditation ? { ...ids, accreditationId: accreditation.id } : null
}
