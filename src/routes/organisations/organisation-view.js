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

/** @import { Material, Organisation, OrganisationStatus, RegulatorValue, ReprocessingType } from '#domain/organisations/model.js' */
/** @import { AccreditationStatus, RegistrationStatus } from '#domain/organisations/model.js' */

/**
 * @typedef {Extract<RegistrationStatus, 'approved' | 'cancelled'>} ServedRegistrationStatus
 */

/**
 * @typedef {Extract<AccreditationStatus, 'approved' | 'suspended' | 'cancelled'>} ServedAccreditationStatus
 */

/** @type {readonly ServedRegistrationStatus[]} */
export const SERVED_REGISTRATION_STATUSES = Object.freeze([
  REGISTRATION_STATUS.APPROVED,
  REGISTRATION_STATUS.CANCELLED
])

/** @type {readonly ServedAccreditationStatus[]} */
export const SERVED_ACCREDITATION_STATUSES = Object.freeze([
  ACCREDITATION_STATUS.APPROVED,
  ACCREDITATION_STATUS.SUSPENDED,
  ACCREDITATION_STATUS.CANCELLED
])
/** @import { Registration, RegistrationAddress } from '#domain/organisations/registration.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { OverseasSite } from '#overseas-sites/repository/port.js' */

/**
 * @typedef {(message: string) => void} OnDrop
 */

/**
 * @typedef {{ code: RegulatorValue }} RegulatorView
 */

/**
 * The parsed address, or the address as submitted when it could not be parsed.
 *
 * @typedef {{
 *   county?: string
 *   line1: string
 *   line2?: string
 *   postcode: string
 *   town: string
 * } | { fullAddress: string }} UkAddressView
 */

/**
 * @typedef {{
 *   country: string
 *   line1: string
 *   line2?: string
 *   postcode?: string
 *   stateOrRegion?: string
 *   townOrCity: string
 * }} OverseasAddressView
 */

/**
 * @typedef {{
 *   address: OverseasAddressView
 *   coordinates?: string
 *   name: string
 * }} OverseasSiteView
 */

/**
 * @typedef {{ status: 'pending' } | { approvedOn: string, status: 'approved' }} AccreditedOverseasSiteView
 */

/**
 * @typedef {{
 *   accreditationNumber: string
 *   status: ServedAccreditationStatus
 * }} AccreditationView
 */

/**
 * @typedef {AccreditationView & {
 *   overseasSites: Record<string, AccreditedOverseasSiteView>
 * }} ExporterAccreditationView
 */

/**
 * @typedef {{
 *   material: Material
 *   status: ServedRegistrationStatus
 *   submittedToRegulator: RegulatorView
 *   validFrom: string
 * }} RegistrationViewCommon
 */

/**
 * @typedef {RegistrationViewCommon & {
 *   accreditations: Record<string, AccreditationView>
 *   reprocessingType: ReprocessingType
 *   site: { address: UkAddressView }
 *   wasteProcessingType: 'reprocessor'
 * }} ReprocessorRegistrationView
 */

/**
 * @typedef {RegistrationViewCommon & {
 *   accreditations: Record<string, ExporterAccreditationView>
 *   overseasSites: Record<string, OverseasSiteView>
 *   wasteProcessingType: 'exporter'
 * }} ExporterRegistrationView
 */

/**
 * @typedef {ReprocessorRegistrationView | ExporterRegistrationView} RegistrationView
 */

/**
 * @typedef {{
 *   linkedDefraOrganisation?: {
 *     defraOrganisation: { id: string, name: string }
 *     linkedAt: string
 *     linkedBy: { email: string }
 *   }
 *   name: string
 *   organisationNumber: number
 *   registrations: Record<string, RegistrationView>
 *   status: OrganisationStatus
 *   submittedToRegulator: RegulatorView
 *   tradingName?: string
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
        linkedAt: new Date(linkedDefraOrganisation.linkedAt).toISOString(),
        linkedBy: { email: linkedDefraOrganisation.linkedBy.email }
      }
    }),
    registrations: keyedViews(
      organisation.registrations,
      (registration) =>
        toRegistrationEntry(
          registration,
          organisation,
          overseasSitesById,
          onDrop
        ),
      'Registration number',
      onDrop
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
export function toRegistrationEntry(
  registration,
  organisation,
  overseasSitesById,
  onDrop
) {
  const { registrationNumber, status, validFrom } = registration
  if (!registrationNumber) {
    onDrop(`Registration ${registration.id} has no registration number`)
    return null
  }
  if (!isOneOf(SERVED_REGISTRATION_STATUSES, status)) {
    onDrop(`Registration ${registrationNumber} has status ${status}`)
    return null
  }
  if (!validFrom) {
    onDrop(`Registration ${registrationNumber} has no validFrom`)
    return null
  }

  /** @type {RegistrationViewCommon} */
  const common = {
    status,
    validFrom,
    material: resolveMaterial(registration),
    submittedToRegulator: { code: registration.submittedToRegulator }
  }
  const accreditations = keyedViews(
    accreditationsForRegistration(registration, organisation),
    (accreditation) => toAccreditationEntry(accreditation, onDrop),
    `Registration ${registrationNumber} accreditation year`,
    onDrop
  )

  if (registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    const overseasSites = toOverseasSites(
      registration,
      overseasSitesById,
      onDrop
    )
    return [
      registrationNumber,
      {
        ...common,
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        overseasSites: mapValues(overseasSites, toSiteView),
        accreditations: withAccreditedSites(accreditations, overseasSites)
      }
    ]
  }

  const { reprocessingType } = registration
  if (!reprocessingType) {
    onDrop(`Registration ${registrationNumber} has no reprocessing type`)
    return null
  }
  const address = toUkAddress(registration.site.address)
  if (!address) {
    onDrop(`Registration ${registrationNumber} has no usable site address`)
    return null
  }

  return [
    registrationNumber,
    {
      ...common,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      reprocessingType,
      site: { address },
      accreditations
    }
  ]
}

/**
 * Until per-year approvals come from the registration service, an exporter's
 * accreditation lists every registration site with the site's stored approval.
 *
 * @param {Record<string, AccreditationView>} accreditations
 * @param {Record<string, OverseasSite>} overseasSites
 * @returns {Record<string, ExporterAccreditationView>}
 */
function withAccreditedSites(accreditations, overseasSites) {
  return mapValues(accreditations, (accreditation) => ({
    ...accreditation,
    overseasSites: mapValues(overseasSites, toAccreditedSiteView)
  }))
}

/**
 * @param {Accreditation} accreditation
 * @param {OnDrop} onDrop
 * @returns {[string, AccreditationView] | null}
 */
export function toAccreditationEntry(accreditation, onDrop) {
  const { accreditationNumber, status } = accreditation
  if (!accreditationNumber) {
    onDrop(`Accreditation ${accreditation.id} has no accreditation number`)
    return null
  }
  if (!isOneOf(SERVED_ACCREDITATION_STATUSES, status)) {
    onDrop(`Accreditation ${accreditationNumber} has status ${status}`)
    return null
  }
  if (!accreditation.validFrom) {
    onDrop(`Accreditation ${accreditationNumber} has no validFrom`)
    return null
  }

  return [
    String(deriveAccreditationYear(accreditation)),
    { accreditationNumber, status }
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
  const { line1, line2, townOrCity, stateOrRegion, postcode } = site.address
  return {
    name: site.name,
    address: {
      line1,
      townOrCity,
      country: site.country,
      ...omitNullish({ line2, stateOrRegion, postcode })
    },
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
 * Ingest keeps the submitted string as `fullAddress` when it cannot find the
 * town.
 *
 * @param {RegistrationAddress} address
 * @returns {UkAddressView | null}
 */
function toUkAddress({ line1, line2, town, county, postcode, fullAddress }) {
  if (line1 && town && postcode) {
    return { line1, town, postcode, ...omitNullish({ line2, county }) }
  }
  if (fullAddress) {
    return { fullAddress }
  }
  return null
}

/**
 * Records sharing a key are all dropped, since the view cannot tell which is
 * right.
 *
 * @template T, V
 * @param {T[]} items
 * @param {(item: T) => [string, V] | null} toEntry
 * @param {string} keyName
 * @param {OnDrop} onDrop
 * @returns {Record<string, V>}
 */
function keyedViews(items, toEntry, keyName, onDrop) {
  const entries = items.map(toEntry).filter((entry) => entry !== null)
  const keys = entries.map(([key]) => key)
  const clashes = new Set(keys.filter((key, i) => keys.indexOf(key) !== i))
  for (const key of clashes) {
    onDrop(`${keyName} ${key} is shared by more than one record`)
  }
  return Object.fromEntries(entries.filter(([key]) => !clashes.has(key)))
}

/**
 * @template {string} T
 * @param {readonly T[]} values
 * @param {string} value
 * @returns {value is T}
 */
function isOneOf(values, value) {
  return /** @type {readonly string[]} */ (values).includes(value)
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
