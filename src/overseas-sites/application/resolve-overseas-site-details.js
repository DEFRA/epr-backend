/** @import { OverseasSiteAddress, OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

/**
 * A registration's overseas-site map as stored: three-digit ORS id to the
 * overseas-site record it names.
 *
 * @typedef {Record<string, { overseasSiteId: string }>} OverseasSiteReferences
 */

/**
 * One resolved site. Every field is null when no stored site carries the
 * referenced id, and validFrom is null on its own when the site is not yet
 * approved.
 *
 * @typedef {{
 *   name: string | null,
 *   country: string | null,
 *   address: OverseasSiteAddress | null,
 *   coordinates: string | null,
 *   validFrom: Date | null
 * }} OverseasSiteDetail
 */

/**
 * Resolves a registration's overseas-site map into detail records keyed by
 * their three-digit ORS id.
 *
 * @param {OverseasSitesRepository} overseasSitesRepository
 * @param {OverseasSiteReferences | undefined} overseasSites
 * @returns {Promise<Record<string, OverseasSiteDetail>>}
 */
export const resolveOverseasSiteDetails = async (
  overseasSitesRepository,
  overseasSites
) => {
  const entries = Object.entries(overseasSites ?? {})

  if (entries.length === 0) {
    return {}
  }

  const sites = await overseasSitesRepository.findByIds(
    entries.map(([, { overseasSiteId }]) => overseasSiteId)
  )
  const sitesById = new Map(sites.map((site) => [site.id, site]))

  return Object.fromEntries(
    entries.map(([orsId, { overseasSiteId }]) => {
      const site = sitesById.get(overseasSiteId)
      return [
        orsId,
        {
          name: site?.name ?? null,
          country: site?.country ?? null,
          address: site?.address ?? null,
          coordinates: site?.coordinates ?? null,
          validFrom: site?.validFrom ?? null
        }
      ]
    })
  )
}
