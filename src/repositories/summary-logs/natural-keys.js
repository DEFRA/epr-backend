import { resolveNaturalKey } from '#repositories/organisations/natural-keys.js'

/**
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { StoredKey } from '#repositories/organisations/natural-keys.js'
 * @import { KeyedSummaryLogWithId, SummaryLogKey, SummaryLogWithId } from './port.js'
 */

/**
 * @typedef {StoredKey} StoredSummaryLogKey
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
export const resolveSummaryLogKey = async (organisationsRepository, key) => {
  const resolved = await resolveNaturalKey(organisationsRepository, key)
  if (!resolved) {
    return null
  }

  const { organisationNumber, registrationNumber } = key
  return {
    storedKey: resolved.storedKey,
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
          accreditationNumber: resolved.accreditationNumberOf(accreditationId)
        })
      }
    })
  }
}
