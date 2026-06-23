/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */

/**
 * Builds a map from ORS key (e.g. "120") to site name, country, and
 * valid-from date, looked up from the overseas-sites repository.
 *
 * @param {OverseasSitesRepository} overseasSitesRepository
 * @param {Record<string, { overseasSiteId: string }> | undefined} overseasSites
 * @returns {Promise<Map<string, { siteName: string|null, country: string|null, validFrom: Date|null }>>}
 */
export async function getOrsDetailsMap(overseasSitesRepository, overseasSites) {
  const entries = Object.entries(overseasSites ?? {})
  if (entries.length === 0) {
    return new Map()
  }

  const siteIds = entries.map(([, { overseasSiteId }]) => overseasSiteId)
  const sites = await overseasSitesRepository.findByIds(siteIds)
  const sitesById = new Map(sites.map((site) => [site.id, site]))

  return new Map(
    entries.map(([orsKey, { overseasSiteId }]) => {
      const site = sitesById.get(overseasSiteId)
      return [
        orsKey,
        {
          siteName: site?.name ?? null,
          country: site?.country ?? null,
          validFrom: site?.validFrom ?? null
        }
      ]
    })
  )
}
