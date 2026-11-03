/** @import {OverseasSite} from '#overseas-sites/repository/port.js' */
/** @import {OverseasSitesContext} from '#waste-balances/domain/classification-context.js' */

/**
 * One approved site in the context: `approvedFrom` is used by
 * classifyForWasteBalance, `name` populates OSR_NAME_REVISED and `country`
 * OSR_COUNTRY_REVISED.
 *
 * @typedef {Exclude<OverseasSitesContext, symbol>[string]} OverseasSiteContextEntry
 */

/**
 * Builds an ORS context map for a single registration from a pre-loaded
 * sites-by-id Map. The returned object is keyed by the 3-digit OSR key
 * (as stored on the registration) and contains the approvedFrom date used
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
 * @returns {Exclude<OverseasSitesContext, symbol>}
 */
export const buildOverseasSitesContext = (registration, sitesById) => {
  const entries = Object.entries(registration?.overseasSites ?? {})

  /** @type {Exclude<OverseasSitesContext, symbol>} */
  const context = {}
  for (const [osrKey, { overseasSiteId }] of entries) {
    const site = sitesById.get(overseasSiteId)
    if (site) {
      context[osrKey] = {
        approvedFrom: site.validFrom ?? null,
        name: site.name,
        country: site.country
      }
    }
  }
  return context
}
