import Boom from '@hapi/boom'

/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */
/** @import { OrganisationAdministrationRepository } from '#repositories/organisations/administration-port.js' */
/** @import {OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */

/**
 * Resolves overseas sites for an exporter registration into a lookup map
 * keyed by the 3-digit zero-padded OSR ID string (e.g. "099").
 *
 * A reference that resolves to no stored site is omitted rather than carried
 * with a null approval date, so classification reads it as a site it cannot
 * find (VAL015) rather than one awaiting approval (VAL014).
 *
 * Used during waste balance classification to check ORS approval status (VAL014).
 *
 * @param {OrganisationAdministrationRepository} organisationAdministrationRepository
 * @param {OverseasSitesRepository} overseasSitesRepository
 * @param {OrganisationNumber} organisationNumber
 * @param {RegistrationNumber} registrationNumber
 * @returns {Promise<Record<string, { validFrom: Date | null }>>}
 */
export const resolveOverseasSites = async (
  organisationAdministrationRepository,
  overseasSitesRepository,
  organisationNumber,
  registrationNumber
) => {
  const organisation =
    await organisationAdministrationRepository.findByOrganisationNumber(
      organisationNumber
    )
  const registration = organisation?.registrations.find(
    (candidate) => candidate.registrationNumber === registrationNumber
  )

  if (!registration) {
    throw Boom.internal(
      `Registration not found: ${registrationNumber} for organisation ${organisationNumber}`
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
    if (site) {
      resolved[osrKey] = { validFrom: site.validFrom ?? null }
    }
  }

  return resolved
}
