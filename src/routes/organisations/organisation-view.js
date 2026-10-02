import { deriveAccreditationYear } from '#common/helpers/dates/accreditation.js'
import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  accreditationsForRegistration,
  resolveMaterial
} from '#domain/organisations/registration-utils.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { AccreditationStatus, RegistrationStatus } from '#domain/organisations/model.js' */

/** @type {readonly RegistrationStatus[]} */
export const SERVED_REGISTRATION_STATUSES = Object.freeze([
  REGISTRATION_STATUS.APPROVED,
  REGISTRATION_STATUS.CANCELLED
])

/** @type {readonly AccreditationStatus[]} */
export const SERVED_ACCREDITATION_STATUSES = Object.freeze([
  ACCREDITATION_STATUS.APPROVED,
  ACCREDITATION_STATUS.SUSPENDED,
  ACCREDITATION_STATUS.CANCELLED
])
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { OverseasSite } from '#overseas-sites/repository/port.js' */

/**
 * @typedef {(message: string) => void} OnDrop
 */

/**
 * @typedef {{ code: string }} RegulatorView
 */

/**
 * @typedef {{
 *   name: string
 *   address: Record<string, string>
 *   coordinates?: string
 * }} OverseasSiteView
 */

/**
 * @typedef {{ status: 'pending' } | { status: 'approved', approvedOn: string }} AccreditedOverseasSiteView
 */

/**
 * @typedef {{
 *   accreditationNumber: string
 *   status: string
 *   overseasSites?: Record<string, AccreditedOverseasSiteView>
 * }} AccreditationView
 */

/**
 * @typedef {{
 *   status: string
 *   validFrom: string
 *   material: string
 *   submittedToRegulator: RegulatorView
 *   wasteProcessingType: string
 *   reprocessingType?: string
 *   site?: { address: Record<string, string> }
 *   overseasSites?: Record<string, OverseasSiteView>
 *   accreditations: Record<string, AccreditationView>
 * }} RegistrationView
 */

/**
 * @typedef {{
 *   organisationNumber: number
 *   name: string
 *   tradingName?: string
 *   status: string
 *   submittedToRegulator: RegulatorView
 *   linkedDefraOrganisation?: {
 *     defraOrganisation: { id: string, name: string }
 *     linkedAt: string
 *     linkedBy: { email: string }
 *   }
 *   registrations: Record<string, RegistrationView>
 * }} OrganisationView
 */

/**
 * Serves only registrations and accreditations granted a number. A record the
 * view cannot represent is dropped and reported through `onDrop`.
 *
 * @param {Organisation} organisation
 * @param {Map<string, OverseasSite>} overseasSitesById
 * @param {OnDrop} onDrop
 * @returns {OrganisationView}
 */
export function toOrganisationView(organisation, overseasSitesById, onDrop) {
  const { companyDetails, linkedDefraOrganisation } = organisation

  return {
    organisationNumber: organisation.orgId,
    name: companyDetails.name,
    ...omitNullish({ tradingName: companyDetails.tradingName }),
    status: organisation.status,
    submittedToRegulator: { code: organisation.submittedToRegulator },
    ...(linkedDefraOrganisation && {
      linkedDefraOrganisation: {
        defraOrganisation: {
          id: linkedDefraOrganisation.orgId,
          name: linkedDefraOrganisation.orgName
        },
        linkedAt: linkedDefraOrganisation.linkedAt,
        linkedBy: { email: linkedDefraOrganisation.linkedBy.email }
      }
    }),
    registrations: keyedViews(organisation.registrations, (registration) =>
      toRegistrationEntry(registration, organisation, overseasSitesById, onDrop)
    )
  }
}

/**
 * @param {Registration} registration
 * @param {Organisation} organisation
 * @param {Map<string, OverseasSite>} overseasSitesById
 * @param {OnDrop} onDrop
 * @returns {[string, RegistrationView] | null}
 */
function toRegistrationEntry(
  registration,
  organisation,
  overseasSitesById,
  onDrop
) {
  const { registrationNumber } = registration
  if (!registrationNumber) {
    onDrop(`Registration ${registration.id} has no registration number`)
    return null
  }
  if (!SERVED_REGISTRATION_STATUSES.includes(registration.status)) {
    onDrop(
      `Registration ${registrationNumber} has status ${registration.status}`
    )
    return null
  }
  if (!registration.validFrom) {
    onDrop(`Registration ${registrationNumber} has no validFrom`)
    return null
  }

  const isExporter =
    registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
  if (!isExporter && !registration.reprocessingType) {
    onDrop(`Registration ${registrationNumber} has no reprocessing type`)
    return null
  }

  const overseasSites = isExporter
    ? toOverseasSites(registration, overseasSitesById, onDrop)
    : undefined

  const common = {
    status: registration.status,
    validFrom: registration.validFrom,
    material: resolveMaterial(registration),
    submittedToRegulator: { code: registration.submittedToRegulator },
    wasteProcessingType: registration.wasteProcessingType,
    accreditations: keyedViews(
      accreditationsForRegistration(registration, organisation),
      (accreditation) =>
        toAccreditationEntry(accreditation, overseasSites, onDrop)
    )
  }

  return [
    registrationNumber,
    overseasSites
      ? { ...common, overseasSites: mapValues(overseasSites, toSiteView) }
      : {
          ...common,
          reprocessingType: registration.reprocessingType,
          site: { address: toUkAddress(registration.site.address) }
        }
  ]
}

/**
 * Until per-year approvals come from the registration service, an exporter's
 * accreditation lists every registration site with the site's stored approval.
 *
 * @param {Accreditation} accreditation
 * @param {Record<string, OverseasSite> | undefined} overseasSites
 * @param {OnDrop} onDrop
 * @returns {[string, AccreditationView] | null}
 */
function toAccreditationEntry(accreditation, overseasSites, onDrop) {
  const { accreditationNumber } = accreditation
  if (!accreditationNumber) {
    onDrop(`Accreditation ${accreditation.id} has no accreditation number`)
    return null
  }
  if (!SERVED_ACCREDITATION_STATUSES.includes(accreditation.status)) {
    onDrop(
      `Accreditation ${accreditationNumber} has status ${accreditation.status}`
    )
    return null
  }
  if (!accreditation.validFrom) {
    onDrop(`Accreditation ${accreditationNumber} has no validFrom`)
    return null
  }

  return [
    String(deriveAccreditationYear(accreditation)),
    {
      accreditationNumber,
      status: accreditation.status,
      ...(overseasSites && {
        overseasSites: mapValues(overseasSites, toAccreditedSiteView)
      })
    }
  ]
}

/**
 * @param {Registration} registration
 * @param {Map<string, OverseasSite>} overseasSitesById
 * @param {OnDrop} onDrop
 * @returns {Record<string, OverseasSite>}
 */
function toOverseasSites(registration, overseasSitesById, onDrop) {
  const entries = Object.entries(registration.overseasSites ?? {}).flatMap(
    ([orsId, { overseasSiteId }]) => {
      const site = overseasSitesById.get(overseasSiteId)
      if (!site) {
        onDrop(
          `Registration ${registration.registrationNumber} ORS ${orsId} names a missing overseas site`
        )
        return []
      }
      return [[orsId, site]]
    }
  )
  return Object.fromEntries(entries)
}

/**
 * @param {OverseasSite} site
 * @returns {OverseasSiteView}
 */
function toSiteView(site) {
  return {
    name: site.name,
    address: omitNullish({ ...site.address, country: site.country }),
    ...omitNullish({ coordinates: site.coordinates })
  }
}

/**
 * @param {OverseasSite} site
 * @returns {AccreditedOverseasSiteView}
 */
function toAccreditedSiteView(site) {
  return site.validFrom
    ? {
        status: 'approved',
        approvedOn: site.validFrom.toISOString().slice(0, 10)
      }
    : { status: 'pending' }
}

/**
 * @param {Record<string, string | undefined>} address
 */
function toUkAddress({ line1, line2, town, county, postcode }) {
  return omitNullish({ line1, line2, town, county, postcode })
}

/**
 * @template T, V
 * @param {T[]} items
 * @param {(item: T) => [string, V] | null} toEntry
 * @returns {Record<string, V>}
 */
function keyedViews(items, toEntry) {
  return Object.fromEntries(
    items.map(toEntry).filter((entry) => entry !== null)
  )
}

/**
 * @template T, V
 * @param {Record<string, T>} record
 * @param {(value: T) => V} map
 * @returns {Record<string, V>}
 */
function mapValues(record, map) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, map(value)])
  )
}

/**
 * @template {Record<string, unknown>} T
 * @param {T} record
 * @returns {{ [K in keyof T]?: NonNullable<T[K]> }}
 */
function omitNullish(record) {
  return /** @type {{ [K in keyof T]?: NonNullable<T[K]> }} */ (
    Object.fromEntries(
      Object.entries(record).filter(
        ([, value]) => value !== null && value !== undefined
      )
    )
  )
}
