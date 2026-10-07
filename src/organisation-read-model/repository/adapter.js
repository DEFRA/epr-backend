import { deriveAccreditationYear } from '#common/helpers/dates/accreditation.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  accreditationsForRegistration,
  resolveMaterial
} from '#domain/organisations/registration-utils.js'
import {
  ACCREDITATION_STATUSES,
  ORGANISATION_STATUSES,
  REGISTRATION_STATUSES,
  statusOn
} from '#organisation-read-model/domain/model.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Accreditation as StoredAccreditation, StatusHistoryEntryOf } from '#domain/organisations/accreditation.js' */
/** @import { Address, Organisation as StoredOrganisation, User } from '#domain/organisations/model.js' */
/** @import { Registration as StoredRegistration } from '#domain/organisations/registration.js' */
/** @import { AccreditationCommon, AccreditedOverseasSite, Contact, ExporterAccreditation, ExporterRegistration, Organisation, OverseasSite, Registration, RegistrationCommon, ReprocessorRegistration, StatusTimeline, UkAddress } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { OverseasSite as StoredOverseasSite, OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationReadRepository } from './port.js' */

/**
 * @typedef {(message: string) => void} OnDrop
 */

/**
 * @typedef {{
 *   onDrop: OnDrop
 *   overseasSitesById: Map<string, StoredOverseasSite>
 *   today: string
 * }} Context
 */

/**
 * @param {{
 *   organisationsRepository: OrganisationsRepository
 *   overseasSitesRepository: OverseasSitesRepository
 *   logger: TypedLogger
 * }} dependencies
 * @returns {OrganisationReadRepository}
 */
export const createOrganisationReadRepository = ({
  organisationsRepository,
  overseasSitesRepository,
  logger
}) => ({
  findByOrganisationNumber: async (organisationNumber) => {
    const stored = await organisationsRepository.findByOrgId(organisationNumber)
    if (!stored) {
      return null
    }

    const siteIds = stored.registrations.flatMap((registration) =>
      Object.values(registration.overseasSites ?? {}).map(
        ({ overseasSiteId }) => overseasSiteId
      )
    )
    const sites = await overseasSitesRepository.findByIds(siteIds)

    return toOrganisation(stored, {
      onDrop: (message) => logger.warn({ message }),
      overseasSitesById: new Map(sites.map((site) => [site.id, site])),
      today: new Date().toISOString().slice(0, 10)
    })
  }
})

/**
 * Serves only registrations and accreditations granted a number. A record the
 * model cannot represent is dropped and reported through `onDrop`.
 *
 * @param {StoredOrganisation} stored
 * @param {Context} context
 * @returns {Organisation | null}
 */
function toOrganisation(stored, context) {
  const statusTimeline = toStatusTimeline(stored.statusHistory)
  const status = statusOn(statusTimeline, context.today)
  if (!isOneOf(ORGANISATION_STATUSES, status)) {
    context.onDrop(
      `Organisation ${stored.orgId} has status ${status} on ${context.today}`
    )
    return null
  }

  const { companyDetails, linkedDefraOrganisation } = stored

  return {
    organisationNumber: stored.orgId,
    name: companyDetails.name,
    ...omitNullish({
      companiesHouseNumber: companyDetails.companiesHouseNumber,
      registeredAddress: toUkAddress(companyDetails.registeredAddress),
      tradingName: companyDetails.tradingName
    }),
    status,
    statusTimeline,
    submittedToRegulator: { code: stored.submittedToRegulator },
    submitterContactDetails: toContact(stored.submitterContactDetails),
    users: stored.users.map(({ contactId, email, roles }) => ({
      email,
      roles,
      ...omitNullish({ contactId })
    })),
    version: stored.version,
    ...(linkedDefraOrganisation && {
      linkedDefraOrganisation: {
        defraOrganisation: {
          id: linkedDefraOrganisation.orgId,
          name: linkedDefraOrganisation.orgName
        },
        linkedAt: new Date(linkedDefraOrganisation.linkedAt).toISOString(),
        linkedBy: {
          email: linkedDefraOrganisation.linkedBy.email,
          id: linkedDefraOrganisation.linkedBy.id
        }
      }
    }),
    registrations: keyedRecords(
      stored.registrations,
      (registration) => toRegistrationEntry(registration, stored, context),
      'Registration number',
      context.onDrop
    )
  }
}

/**
 * @param {StoredRegistration} registration
 * @param {StoredOrganisation} organisation
 * @param {Context} context
 * @returns {[string, Registration] | null}
 */
export function toRegistrationEntry(registration, organisation, context) {
  const { onDrop, today } = context
  const { registrationNumber, validFrom, applicationContactDetails } =
    registration
  if (!registrationNumber) {
    onDrop(`Registration ${registration.id} has no registration number`)
    return null
  }
  const statusTimeline = toStatusTimeline(registration.statusHistory)
  const status = statusOn(statusTimeline, today)
  if (!isOneOf(REGISTRATION_STATUSES, status)) {
    onDrop(
      `Registration ${registrationNumber} has status ${status} on ${today}`
    )
    return null
  }
  if (!validFrom) {
    onDrop(`Registration ${registrationNumber} has no validFrom`)
    return null
  }
  if (!applicationContactDetails) {
    onDrop(
      `Registration ${registrationNumber} has no application contact details`
    )
    return null
  }

  /** @type {RegistrationCommon} */
  const common = {
    applicationContactDetails: toContact(applicationContactDetails),
    approvedPersons: registration.approvedPersons.map(toContact),
    material: resolveMaterial(registration),
    status,
    statusTimeline,
    submittedToRegulator: { code: registration.submittedToRegulator },
    submitterContactDetails: toContact(registration.submitterContactDetails),
    validFrom
  }
  const accreditations = keyedRecords(
    accreditationsForRegistration(registration, organisation),
    (accreditation) => toAccreditationEntry(accreditation, context),
    `Registration ${registrationNumber} accreditation year`,
    onDrop
  )

  const converted =
    registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
      ? toExporterRegistration(registration, common, accreditations, context)
      : toReprocessorRegistration(registration, common, accreditations, onDrop)

  return converted && [registrationNumber, converted]
}

/**
 * @param {StoredRegistration} registration
 * @param {RegistrationCommon} common
 * @param {Record<string, AccreditationCommon>} accreditations
 * @param {Context} context
 * @returns {ExporterRegistration}
 */
function toExporterRegistration(registration, common, accreditations, context) {
  const overseasSites = toStoredOverseasSites(registration, context)
  return {
    ...common,
    wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
    overseasSites: mapValues(overseasSites, toOverseasSite),
    accreditations: withAccreditedSites(accreditations, overseasSites)
  }
}

/**
 * @param {StoredRegistration} registration
 * @param {RegistrationCommon} common
 * @param {Record<string, AccreditationCommon>} accreditations
 * @param {OnDrop} onDrop
 * @returns {ReprocessorRegistration | null}
 */
function toReprocessorRegistration(
  registration,
  common,
  accreditations,
  onDrop
) {
  const { registrationNumber, reprocessingType } = registration
  if (!reprocessingType) {
    onDrop(`Registration ${registrationNumber} has no reprocessing type`)
    return null
  }
  const { country, region } = registration.site.address
  const address = toUkAddress(registration.site.address)
  if (!address) {
    onDrop(`Registration ${registrationNumber} has no usable site address`)
    return null
  }

  return {
    ...common,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType,
    site: { address: { ...address, ...omitNullish({ country, region }) } },
    accreditations
  }
}

/**
 * Until per-year approvals come from the registration service, an exporter's
 * accreditation lists every registration site with the site's stored approval.
 *
 * @param {Record<string, AccreditationCommon>} accreditations
 * @param {Record<string, StoredOverseasSite>} overseasSites
 * @returns {Record<string, ExporterAccreditation>}
 */
function withAccreditedSites(accreditations, overseasSites) {
  return mapValues(accreditations, (accreditation) => ({
    ...accreditation,
    overseasSites: mapValues(overseasSites, toAccreditedOverseasSite)
  }))
}

/**
 * @param {StoredAccreditation} accreditation
 * @param {Context} context
 * @returns {[string, AccreditationCommon] | null}
 */
export function toAccreditationEntry(accreditation, { onDrop, today }) {
  const { accreditationNumber, prnIssuance } = accreditation
  if (!accreditationNumber) {
    onDrop(`Accreditation ${accreditation.id} has no accreditation number`)
    return null
  }
  const statusTimeline = toStatusTimeline(accreditation.statusHistory)
  const status = statusOn(statusTimeline, today)
  if (!isOneOf(ACCREDITATION_STATUSES, status)) {
    onDrop(
      `Accreditation ${accreditationNumber} has status ${status} on ${today}`
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
      prnIssuance: {
        signatories: prnIssuance.signatories.map(toContact),
        tonnageBand: prnIssuance.tonnageBand
      },
      status,
      statusTimeline,
      submitterContactDetails: toContact(accreditation.submitterContactDetails)
    }
  ]
}

/**
 * Until ADR-0051's events exist, each change takes effect on the day it was
 * recorded, and the last recorded on a day wins.
 *
 * @param {StatusHistoryEntryOf<string>[]} statusHistory
 * @returns {StatusTimeline}
 */
function toStatusTimeline(statusHistory) {
  return Object.fromEntries(
    statusHistory.map(({ status, updatedAt }) => [
      new Date(updatedAt).toISOString().slice(0, 10),
      { status }
    ])
  )
}

/**
 * @param {StoredRegistration} registration
 * @param {Context} context
 * @returns {Record<string, StoredOverseasSite>}
 */
function toStoredOverseasSites(registration, { overseasSitesById, onDrop }) {
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
 * @param {StoredOverseasSite} site
 * @returns {OverseasSite}
 */
function toOverseasSite(site) {
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
 * @param {StoredOverseasSite} site
 * @returns {AccreditedOverseasSite}
 */
function toAccreditedOverseasSite(site) {
  return site.validFrom
    ? {
        status: 'approved',
        approvedOn: new Date(site.validFrom).toISOString().slice(0, 10)
      }
    : { status: 'pending' }
}

/**
 * Ingest keeps the submitted string as `fullAddress` when it cannot find the
 * town.
 *
 * @param {Address} [address]
 * @returns {UkAddress | null}
 */
function toUkAddress({
  line1,
  line2,
  town,
  county,
  postcode,
  fullAddress
} = {}) {
  if (line1 && town && postcode) {
    return { line1, town, postcode, ...omitNullish({ line2, county }) }
  }
  if (fullAddress) {
    return { fullAddress }
  }
  return null
}

/**
 * @param {User} user
 * @returns {Contact}
 */
function toContact({ email, fullName, phone }) {
  return { email, fullName, ...omitNullish({ phone }) }
}

/**
 * Records sharing a key are all dropped, since the model cannot tell which is
 * right.
 *
 * @template T, V
 * @param {T[]} items
 * @param {(item: T) => [string, V] | null} toEntry
 * @param {string} keyName
 * @param {OnDrop} onDrop
 * @returns {Record<string, V>}
 */
function keyedRecords(items, toEntry, keyName, onDrop) {
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
 * @param {string | undefined} value
 * @returns {value is T}
 */
function isOneOf(values, value) {
  return /** @type {readonly (string | undefined)[]} */ (values).includes(value)
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
