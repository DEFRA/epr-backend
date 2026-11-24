/** @import { OrganisationAdministrationRepository } from '#repositories/organisations/administration-port.js' */
/** @import { RegistrationAccreditationAdminRepository } from './port.js' */

/**
 * Reads the organisations an in-memory organisations repository holds, with
 * the same lag behind its writes as the rest of its reads.
 *
 * @param {Pick<OrganisationAdministrationRepository, 'findAllIds' | 'findById'>} organisationsRepository
 * @returns {() => RegistrationAccreditationAdminRepository}
 */
export const createInMemoryRegistrationAccreditationAdminRepository = (
  organisationsRepository
) => {
  const readAll = async () => {
    const { organisations } = await organisationsRepository.findAllIds()
    return Promise.all(
      [...organisations].map((id) => organisationsRepository.findById(id))
    )
  }

  return () => ({
    isAccreditationNumberInUse: async (accreditationNumber) =>
      (await readAll()).some((org) =>
        org.accreditations.some(
          (acc) => acc.accreditationNumber === accreditationNumber
        )
      ),
    isRegistrationNumberInUse: async (registrationNumber) =>
      (await readAll()).some((org) =>
        org.registrations.some(
          (reg) => reg.registrationNumber === registrationNumber
        )
      )
  })
}
