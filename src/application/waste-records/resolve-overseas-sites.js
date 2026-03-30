import Boom from '@hapi/boom'

/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * Resolves overseas sites for an exporter registration into a lookup map
 * keyed by the 3-digit zero-padded OSR ID string (e.g. "099").
 *
 * Used during waste balance classification to check ORS approval status (VAL014).
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {OverseasSitesRepository} overseasSitesRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<Record<string, { validFrom: Date | null }>>}
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

  if (!registration) {
    throw Boom.internal(
      `Registration not found: ${registrationId} for organisation ${organisationId}`
    )
  }

  const entries = Object.entries(registration.overseasSites ?? {})

  if (entries.length === 0) {
    return {}
  }

  const siteIds = entries.map(([, { overseasSiteId }]) => overseasSiteId)
  const sites = await overseasSitesRepository.findByIds(siteIds)
  const sitesById = new Map(sites.map((site) => [site.id, site]))

  /** @type {Record<string, { validFrom: Date | null }>} */
  const resolved = {}
  for (const [osrKey, { overseasSiteId }] of entries) {
    const site = sitesById.get(overseasSiteId)
    resolved[osrKey] = { validFrom: site?.validFrom ?? null }
  }

  return resolved
}
