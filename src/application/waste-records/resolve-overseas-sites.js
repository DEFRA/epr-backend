/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * Resolves overseas sites for an exporter registration into a lookup map
 * keyed by the 3-digit OSR ID (as a number).
 *
 * Used during waste balance classification to check ORS approval status (VAL014).
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {OverseasSitesRepository} overseasSitesRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<Record<number, { validFrom: Date | null }> | undefined>}
 */
export const resolveOverseasSites = async (
  organisationsRepository,
  overseasSitesRepository,
  organisationId,
  registrationId
) => {
  const registration = await organisationsRepository.findRegistrationById(
    organisationId,
    registrationId
  )

  if (!registration?.overseasSites) {
    return undefined
  }

  const entries = Object.entries(registration.overseasSites)
  if (entries.length === 0) {
    return undefined
  }

  const resolved = {}
  for (const [osrKey, { overseasSiteId }] of entries) {
    const site = await overseasSitesRepository.findById(overseasSiteId)
    resolved[Number(osrKey)] = { validFrom: site?.validFrom ?? null }
  }

  return resolved
}
