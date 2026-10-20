/**
 * @import { OrganisationsRepository } from './port.js'
 */

/**
 * Names a registration's records by the numbers the domain issues, in place
 * of their database ids.
 *
 * @typedef {Object} NaturalKey
 * @property {string} organisationNumber
 * @property {string} registrationNumber
 * @property {string|null} [accreditationNumber] - `null` for registered-only;
 *   absent matches every accreditation
 */

/**
 * The stored ids a key names. `accreditationId` is absent when the key
 * matches every accreditation.
 *
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId?: string | null
 * }} StoredKey
 */

/**
 * Resolves a key to the ids its records are stored under, and gives back the
 * number of each of the organisation's accreditations by its id. Returns null
 * when the key names no registration, or an accreditation the organisation
 * does not hold.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {NaturalKey} key
 * @returns {Promise<{
 *   storedKey: StoredKey,
 *   accreditationNumberOf: (accreditationId: string | null) => string | null | undefined
 * } | null>}
 */
export const resolveNaturalKey = async (
  organisationsRepository,
  { organisationNumber, registrationNumber, accreditationNumber }
) => {
  const organisation = await organisationsRepository.findByOrgId(
    Number(organisationNumber)
  )
  const registration = organisation?.registrations.find(
    (candidate) => candidate.registrationNumber === registrationNumber
  )
  if (!organisation || !registration) {
    return null
  }

  const accreditationNumbers = new Map(
    organisation.accreditations.map(({ id, accreditationNumber: number }) => [
      id,
      number
    ])
  )

  /** @type {StoredKey} */
  const storedKey = {
    organisationId: organisation.id,
    registrationId: registration.id
  }
  if (accreditationNumber !== undefined) {
    if (accreditationNumber === null) {
      storedKey.accreditationId = null
    } else {
      const accreditation = organisation.accreditations.find(
        (candidate) => candidate.accreditationNumber === accreditationNumber
      )
      if (!accreditation) {
        return null
      }
      storedKey.accreditationId = accreditation.id
    }
  }

  return {
    storedKey,
    accreditationNumberOf: (accreditationId) =>
      accreditationId && accreditationNumbers.get(accreditationId)
  }
}
