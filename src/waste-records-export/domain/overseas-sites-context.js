/** @import {OverseasSite} from '#overseas-sites/repository/port.js' */

/**
 * Builds an ORS context map for a single registration from a pre-loaded
 * sites-by-id Map. The returned object is keyed by the 3-digit OSR key
 * (as stored on the registration) and contains the validFrom date used
 * by classifyForWasteBalance.
 *
 * Pure function — no IO. Use after pre-loading all sites once via
 * `overseasSitesRepository.findAll()`.
 *
 * @param {{ overseasSites?: Record<string, { overseasSiteId: string }> | null }} registration
 * @param {Map<string, OverseasSite>} sitesById
 * @returns {Record<string, { validFrom: Date | null }>}
 */
export const buildOverseasSitesContext = (registration, sitesById) => {
  const entries = Object.entries(registration?.overseasSites ?? {})

  /** @type {Record<string, { validFrom: Date | null }>} */
  const context = {}
  for (const [osrKey, { overseasSiteId }] of entries) {
    const site = sitesById.get(overseasSiteId)
    context[osrKey] = { validFrom: site?.validFrom ?? null }
  }
  return context
}
