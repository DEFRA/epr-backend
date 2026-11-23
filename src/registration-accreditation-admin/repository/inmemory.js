/** @import { OrganisationAdministrationRepository } from '#repositories/organisations/administration-port.js' */
/** @import { RegistrationAccreditationAdminRepository } from './port.js' */

/**
 * Reads the organisations an in-memory organisations repository holds, with
 * the same lag behind its writes as the rest of its reads.
 *
 * @param {Pick<OrganisationAdministrationRepository, 'findAll'>} organisationsRepository
 * @returns {() => RegistrationAccreditationAdminRepository}
 */
export const createInMemoryRegistrationAccreditationAdminRepository =
  (organisationsRepository) => () => ({
    isAccreditationNumberInUse: async (accreditationNumber) =>
      (await organisationsRepository.findAll()).some((org) =>
        org.accreditations.some(
          (acc) => acc.accreditationNumber === accreditationNumber
        )
      ),
    isRegistrationNumberInUse: async (registrationNumber) =>
      (await organisationsRepository.findAll()).some((org) =>
        org.registrations.some(
          (reg) => reg.registrationNumber === registrationNumber
        )
      )
  })
