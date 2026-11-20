/** @import { RegistrationAccreditationAdminRepository } from './port.js' */

/**
 * Reads the store of an in-memory organisations repository, as the MongoDB
 * adapter reads the organisations repository's collection.
 *
 * @param {object} organisationsRepository - from createInMemoryOrganisationsRepository
 * @returns {() => RegistrationAccreditationAdminRepository}
 */
export const createInMemoryRegistrationAccreditationAdminRepository = (
  organisationsRepository
) => {
  if (
    !('_getStorageForTesting' in organisationsRepository) ||
    typeof organisationsRepository._getStorageForTesting !== 'function'
  ) {
    throw new TypeError('Expected an in-memory organisations repository')
  }
  /** @type {Array<{ accreditations: Array<{ accreditationNumber?: string }>, registrations: Array<{ registrationNumber?: string }> }>} */
  const storage = organisationsRepository._getStorageForTesting()

  return () => ({
    isAccreditationNumberInUse: async (accreditationNumber) =>
      storage.some((org) =>
        org.accreditations.some(
          (acc) => acc.accreditationNumber === accreditationNumber
        )
      ),
    isRegistrationNumberInUse: async (registrationNumber) =>
      storage.some((org) =>
        org.registrations.some(
          (reg) => reg.registrationNumber === registrationNumber
        )
      )
  })
}
