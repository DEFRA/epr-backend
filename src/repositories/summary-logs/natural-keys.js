/**
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { KeyedSummaryLogWithId, SummaryLogKey, SummaryLogWithId } from './port.js'
 */

/**
 * The stored ids a key names. `accreditationId` is absent when the key
 * matches every accreditation.
 *
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId?: string | null
 * }} StoredSummaryLogKey
 */

/**
 * Resolves a key to the ids its summary logs are stored under, and gives back
 * how to name a stored summary log by its numbers. Returns null when the key
 * names no registration, or an accreditation the organisation does not hold.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {SummaryLogKey} key
 * @returns {Promise<{
 *   storedKey: StoredSummaryLogKey,
 *   toKeyed: (stored: SummaryLogWithId) => KeyedSummaryLogWithId
 * } | null>}
 */
export const resolveSummaryLogKey = async (
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

  const accreditationNumbers = new Map(
    organisation.accreditations.map(({ id, accreditationNumber: number }) => [
      id,
      number
    ])
  )

  /** @type {StoredSummaryLogKey} */
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
    toKeyed: ({
      id,
      version,
      summaryLog: {
        organisationId: _o,
        registrationId: _r,
        accreditationId,
        ...summaryLog
      }
    }) => ({
      id,
      version,
      summaryLog: {
        ...summaryLog,
        organisationNumber,
        registrationNumber,
        ...(accreditationId !== undefined && {
          accreditationNumber: accreditationId
            ? (accreditationNumbers.get(accreditationId) ?? null)
            : null
        })
      }
    })
  }
}
