/** @import {OverseasSite} from '#overseas-sites/repository/port.js' */

/**
 * @typedef {Object} OverseasSiteContextEntry
 * @property {Date | null} validFrom - Approval date used by classifyForWasteBalance.
 * @property {string} siteName - Approved site name (for OSR_NAME_REVISED).
 * @property {string} country - Destination country (for OSR_COUNTRY_REVISED).
 */

/**
 * Builds an ORS context map for a single registration from a pre-loaded
 * sites-by-id Map. The returned object is keyed by the 3-digit OSR key
 * (as stored on the registration) and contains the validFrom date used
 * by classifyForWasteBalance, along with the approved site name and
 * destination country used to populate the derived OSR_NAME_REVISED /
 * OSR_COUNTRY_REVISED export columns.
 *
 * A reference that resolves to no stored site is omitted rather than carried
 * with null fields, so classification reads it as a site it cannot find
 * (VAL015) rather than one awaiting approval (VAL014), and the derived export
 * columns fall back to blank as they already do for a row with no OSR_ID.
 *
 * Pure function — no IO. Use after pre-loading all sites once via
 * `overseasSitesRepository.findAll()`.
 *
 * @param {{ overseasSites?: Record<string, { overseasSiteId: string }> | null }} registration
 * @param {Map<string, OverseasSite>} sitesById
 * @returns {Record<string, OverseasSiteContextEntry>}
 */
export const buildOverseasSitesContext = (registration, sitesById) => {
  const entries = Object.entries(registration?.overseasSites ?? {})

  /** @type {Record<string, OverseasSiteContextEntry>} */
  const context = {}
  for (const [osrKey, { overseasSiteId }] of entries) {
    const site = sitesById.get(overseasSiteId)
    if (site) {
      context[osrKey] = {
        validFrom: site.validFrom ?? null,
        siteName: site.name,
        country: site.country
      }
    }
  }
  return context
}
