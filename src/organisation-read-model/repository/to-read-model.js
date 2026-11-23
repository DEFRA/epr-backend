import {
  toCalendarDate,
  utcCalendarDate
} from '#common/helpers/date-formatter.js'
import { isOneOf } from '#common/helpers/is-one-of.js'
import { latestOpenYear } from '#common/helpers/dates/latest-open-year.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { resolveMaterial } from '#domain/organisations/registration-utils.js'
import { STORED_ACCREDITATION_YEAR } from '#repositories/organisations/schema/accreditation.js'
import {
  ACCREDITATION_STATUSES,
  ORGANISATION_STATUSES,
  REGISTRATION_STATUSES,
  statusOn
} from '#organisation-read-model/domain/model.js'
import { standingByYear } from '#organisation-read-model/domain/registration-standing.js'
import { accreditationsForRegistration } from './accreditations-for-registration.js'
import {
  toAccreditationStatusTimeline,
  toOrganisationStatusTimeline,
  toRegistrationStatusTimeline
} from './to-status-timeline.js'
import { organisationInYear } from './organisation-in-year.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Accreditation as StoredAccreditation } from '#domain/organisations/accreditation.js' */
/** @import { Address, StoredLinkedDefraOrganisation, Organisation as StoredOrganisation, User } from '#domain/organisations/model.js' */
/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { Registration as StoredRegistration } from '#domain/organisations/registration.js' */
/** @import { AccreditationCommon, AccreditedOverseasSite, Contact, ExporterAccreditation, ExporterRegistration, Organisation, OrganisationAddress, OverseasSite, Registration, RegistrationCommon, ReprocessorAccreditation, ReprocessorRegistration, UkAddress } from '#organisation-read-model/domain/model.js' */
/** @import { OverseasSite as StoredOverseasSite, OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

/**
 * @typedef {(message: string) => void} OnDrop
 */

/**
 * @typedef {{
 *   onDrop: OnDrop
 *   overseasSitesById: Map<string, StoredOverseasSite>
 *   today: CalendarDate
 * }} Context
 */

/**
 * A registration's accreditation for a year, held outside the REEX database,
 * in the read model's shape, with the registration and year it is for. It
 * holds no overseas sites: an exporter's are lifted from its registration, as
 * a stored accreditation's are.
 *
 * @typedef {AccreditationCommon & {
 *   organisationNumber: OrganisationNumber
 *   registrationNumber: RegistrationNumber
 *   year: Year
 * }} ExternalAccreditation
 */

/**
 * @typedef {Map<RegistrationNumber, Record<Year, AccreditationCommon>>} ExternalAccreditationsByRegistration
 */

/**
 * An external accreditation with no status changes is dropped.
 *
 * @param {ExternalAccreditation} externalAccreditation
 * @param {OnDrop} onDrop
 * @returns {[Year, AccreditationCommon] | null}
 */
const toAccreditationEntryOfYear = (
  {
    organisationNumber: _organisationNumber,
    registrationNumber,
    year,
    ...accreditation
  },
  onDrop
) => {
  if (accreditation.status.timeline.length === 0) {
    onDrop(
      `Registration ${registrationNumber} external accreditation year ${year} has no status changes`
    )
    return null
  }
  return [year, { ...accreditation, year }]
}

/**
 * Each registration's external accreditations, keyed by year.
 *
 * @param {ExternalAccreditation[]} externalAccreditations
 * @param {OnDrop} onDrop
 * @returns {ExternalAccreditationsByRegistration}
 */
const byRegistrationAndYear = (externalAccreditations, onDrop) =>
  new Map(
    [...Map.groupBy(externalAccreditations, (a) => a.registrationNumber)].map(
      ([registrationNumber, held]) => [
        registrationNumber,
        Object.fromEntries(
          held
            .map((a) => toAccreditationEntryOfYear(a, onDrop))
            .filter((entry) => entry !== null)
        )
      ]
    )
  )

/**
 * The stored organisations as the read model shows them, with the external
 * accreditations held for their registrations. An organisation the model
 * cannot represent is left out and reported through `logger.warn`.
 *
 * @param {StoredOrganisation[]} stored
 * @param {ExternalAccreditation[]} externalAccreditations
 * @param {{
 *   overseasSitesRepository: Pick<OverseasSitesRepository, 'findByIds'>
 *   logger: Pick<TypedLogger, 'warn'>
 * }} dependencies
 * @param {Year} [year]
 * @returns {Promise<Organisation[]>}
 */
export async function toReadModelOrganisations(
  stored,
  externalAccreditations,
  { overseasSitesRepository, logger },
  year
) {
  const siteIds = stored.flatMap(({ registrations }) =>
    registrations.flatMap((registration) =>
      Object.values(registration.overseasSites ?? {}).map(
        ({ overseasSiteId }) => overseasSiteId
      )
    )
  )
  const sites = await overseasSitesRepository.findByIds(siteIds)

  /** @type {Context} */
  const context = {
    onDrop: (message) => logger.warn({ message }),
    overseasSitesById: new Map(sites.map((site) => [site.id, site])),
    today: toCalendarDate(new Date())
  }
  const externalByRegistration = byRegistrationAndYear(
    externalAccreditations,
    context.onDrop
  )
  const organisations = stored
    .map((organisation) =>
      toOrganisation(organisation, context, externalByRegistration)
    )
    .filter((organisation) => organisation !== null)

  return year === undefined
    ? organisations
    : organisations.map((organisation) =>
        organisationInYear(organisation, year)
      )
}

/**
 * @param {Pick<StoredOrganisation, 'statusHistory'>} stored
 * @param {CalendarDate} date
 * @returns {boolean}
 */
export function servesOrganisationOn(stored, date) {
  return isOneOf(
    ORGANISATION_STATUSES,
    statusOn(toOrganisationStatusTimeline(stored.statusHistory).timeline, date)
  )
}

/**
 * Serves only registrations and accreditations granted a number. A record the
 * model cannot represent is dropped and reported through `onDrop`.
 *
 * @param {StoredOrganisation} stored
 * @param {Context} context
 * @param {ExternalAccreditationsByRegistration} externalByRegistration
 * @returns {Organisation | null}
 */
function toOrganisation(stored, context, externalByRegistration) {
  const statusTimeline = toOrganisationStatusTimeline(stored.statusHistory)
  const status = statusOn(statusTimeline.timeline, context.today)
  if (!isOneOf(ORGANISATION_STATUSES, status)) {
    context.onDrop(
      `Organisation ${stored.organisationNumber} has status ${status} on ${context.today}`
    )
    return null
  }

  const { companyDetails, linkedDefraOrganisation } = stored

  return {
    organisationNumber: stored.organisationNumber,
    name: companyDetails.name,
    ...omitNullish({
      address: toOrganisationAddress(companyDetails.address),
      companiesHouseNumber: companyDetails.companiesHouseNumber,
      registeredAddress: toOrganisationAddress(
        companyDetails.registeredAddress
      ),
      tradingName: companyDetails.tradingName
    }),
    status: { current: status, ...statusTimeline },
    submittedToRegulator: { code: stored.submittedToRegulator },
    submitterContactDetails: toContact(stored.submitterContactDetails),
    users: stored.users.map(({ contactId, email, fullName, roles }) => ({
      email,
      fullName,
      roles,
      ...omitNullish({ contactId })
    })),
    version: stored.version,
    ...(linkedDefraOrganisation && {
      linkedDefraOrganisation: toLinkedDefraOrganisation(
        linkedDefraOrganisation
      )
    }),
    registrations: keyedRecords(
      stored.registrations,
      (registration) =>
        toRegistrationEntry(
          registration,
          stored,
          context,
          externalByRegistration
        ),
      'Registration number',
      context.onDrop
    )
  }
}

/**
 * @param {StoredLinkedDefraOrganisation} linked
 * @returns {NonNullable<Organisation['linkedDefraOrganisation']>}
 */
export function toLinkedDefraOrganisation(linked) {
  return {
    defraOrganisation: { id: linked.orgId, name: linked.orgName },
    linkedAt: new Date(linked.linkedAt).toISOString(),
    linkedBy: { email: linked.linkedBy.email, id: linked.linkedBy.id }
  }
}

/**
 * A registration's stored and external accreditations by year.
 *
 * @param {{
 *   registration: StoredRegistration
 *   organisation: StoredOrganisation
 *   context: Context
 *   externalAccreditations: Record<Year, AccreditationCommon>
 * }} options
 * @returns {Record<Year, AccreditationCommon>}
 */
function accreditationsOf({
  registration,
  organisation,
  context,
  externalAccreditations
}) {
  return {
    ...keyedRecords(
      accreditationsForRegistration(registration, organisation),
      (accreditation) => toAccreditationEntry(accreditation, context),
      `Registration ${registration.registrationNumber} accreditation year`,
      context.onDrop
    ),
    ...externalAccreditations
  }
}

/**
 * @param {StoredRegistration} registration
 * @param {StoredOrganisation} organisation
 * @param {Context} context
 * @param {ExternalAccreditationsByRegistration} [externalByRegistration]
 * @returns {[RegistrationNumber, Registration] | null}
 */
function toRegistrationEntry(
  registration,
  organisation,
  context,
  externalByRegistration = new Map()
) {
  const { onDrop } = context
  const { registrationNumber, validFrom, applicationContactDetails, status } =
    registration
  // Not served by design, so not logged
  if (!isOneOf(REGISTRATION_STATUSES, status)) {
    return null
  }
  if (!registrationNumber) {
    onDrop(`Registration ${registration.id} has no registration number`)
    return null
  }
  if (!validFrom) {
    onDrop(`Registration ${registrationNumber} has no validFrom`)
    return null
  }
  const statusTimeline = toRegistrationStatusTimeline(
    registration.statusHistory,
    validFrom
  )
  if (!statusTimeline) {
    onDrop(`Registration ${registrationNumber} has no served status changes`)
    return null
  }
  if (!applicationContactDetails) {
    onDrop(
      `Registration ${registrationNumber} has no application contact details`
    )
    return null
  }

  const openYear = latestOpenYear(new Date(context.today))
  const accreditations = accreditationsOf({
    registration,
    organisation,
    context,
    externalAccreditations: externalByRegistration.get(registrationNumber) ?? {}
  })
  const registrationStatus = { current: status, ...statusTimeline }

  /** @type {RegistrationCommon} */
  const common = {
    applicationContactDetails: toContact(applicationContactDetails),
    approvedPersons: registration.approvedPersons.map(toContact),
    material: resolveMaterial(registration),
    standingByDate: standingByYear(
      { status: registrationStatus, accreditations },
      openYear
    ),
    status: registrationStatus,
    submittedToRegulator: { code: registration.submittedToRegulator },
    submitterContactDetails: toContact(registration.submitterContactDetails)
  }

  const converted =
    registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
      ? toExporterRegistration(registration, common, accreditations, context)
      : toReprocessorRegistration(registration, common, accreditations, onDrop)

  return converted && [registrationNumber, converted]
}

/**
 * @param {StoredRegistration} registration
 * @param {RegistrationCommon} common
 * @param {Record<Year, AccreditationCommon>} accreditations
 * @param {Context} context
 * @returns {ExporterRegistration}
 */
function toExporterRegistration(registration, common, accreditations, context) {
  const overseasSites = toStoredOverseasSites(registration, context)
  return {
    ...common,
    wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
    overseasSites: mapValues(overseasSites, toOverseasSite),
    accreditations: withAccreditedSites(
      accreditations,
      overseasSites,
      registration,
      context.onDrop
    )
  }
}

/**
 * @param {StoredRegistration} registration
 * @param {RegistrationCommon} common
 * @param {Record<Year, ReprocessorAccreditation>} accreditations
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
  const address = toUkAddress(registration.site.address)
  if (!address) {
    onDrop(`Registration ${registrationNumber} has no usable site address`)
    return null
  }

  return {
    ...common,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType,
    site: { address },
    accreditations
  }
}

/**
 * Neither a stored nor an external accreditation holds overseas sites, so
 * until per-year approvals come from the registration service an exporter's
 * accreditation lists every registration site with the site's stored
 * approval.
 *
 * @param {Record<Year, AccreditationCommon>} accreditations
 * @param {Record<string, StoredOverseasSite>} overseasSites
 * @param {StoredRegistration} registration
 * @param {OnDrop} onDrop
 * @returns {Record<Year, ExporterAccreditation>}
 */
function withAccreditedSites(
  accreditations,
  overseasSites,
  registration,
  onDrop
) {
  const registrationSites = mapValues(overseasSites, toAccreditedOverseasSite)
  return Object.fromEntries(
    Object.entries(accreditations).map(([year, accreditation]) => [
      year,
      {
        ...accreditation,
        overseasSites: sitesHeldByRegistration(
          registrationSites,
          year,
          registration,
          onDrop
        )
      }
    ])
  )
}

/**
 * The accreditation's sites the registration holds. One it does not hold is
 * dropped. While every accreditation's sites are lifted from its registration
 * none is.
 *
 * @param {Record<string, AccreditedOverseasSite>} sites
 * @param {string} year
 * @param {StoredRegistration} registration
 * @param {OnDrop} onDrop
 * @returns {Record<string, AccreditedOverseasSite>}
 */
function sitesHeldByRegistration(sites, year, registration, onDrop) {
  const held = registration.overseasSites ?? {}
  return Object.fromEntries(
    Object.entries(sites).filter(([orsId]) => {
      const isHeld = Object.hasOwn(held, orsId)
      /* v8 ignore if -- unreachable while sites are lifted from the registration */
      if (!isHeld) {
        onDrop(
          `Registration ${registration.registrationNumber} accreditation year ${year} lists overseas site ${orsId}, which the registration does not hold`
        )
      }
      return isHeld
    })
  )
}

/**
 * @param {StoredAccreditation} accreditation
 * @param {Context} context
 * @returns {[Year, AccreditationCommon] | null}
 */
function toAccreditationEntry(accreditation, { onDrop }) {
  const { accreditationNumber, prnIssuance, status } = accreditation
  // Not served by design, so not logged
  if (!isOneOf(ACCREDITATION_STATUSES, status)) {
    return null
  }
  if (!accreditationNumber) {
    onDrop(`Accreditation ${accreditation.id} has no accreditation number`)
    return null
  }
  if (!accreditation.validFrom) {
    onDrop(`Accreditation ${accreditationNumber} has no validFrom`)
    return null
  }
  const statusTimeline = toAccreditationStatusTimeline(
    accreditation.statusHistory,
    accreditation.validFrom
  )
  if (!statusTimeline) {
    onDrop(`Accreditation ${accreditationNumber} has no served status changes`)
    return null
  }

  const year = STORED_ACCREDITATION_YEAR
  return [
    year,
    {
      accreditationNumber,
      prnIssuance: { tonnageBand: prnIssuance.tonnageBand },
      status: { current: status, ...statusTimeline },
      year
    }
  ]
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
    ...omitNullish({
      coordinates: site.coordinates,
      validFrom: site.validFrom && new Date(site.validFrom).toISOString()
    })
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
        approvedOn: utcCalendarDate(new Date(site.validFrom))
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
  fullAddress,
  country,
  region
} = {}) {
  const area = omitNullish({ country, region })
  if (line1 && postcode) {
    return {
      line1,
      postcode,
      ...omitNullish({ town, line2, county, fullAddress }),
      ...area
    }
  }
  if (fullAddress) {
    return { fullAddress, ...area }
  }
  return null
}

/**
 * A non-UK organisation may have no postcode.
 *
 * @param {Address} [address]
 * @returns {OrganisationAddress | null}
 */
function toOrganisationAddress(address = {}) {
  const { line1, line2, town, county, postcode, fullAddress, country, region } =
    address
  return line1
    ? {
        line1,
        ...omitNullish({
          town,
          line2,
          county,
          postcode,
          fullAddress,
          country,
          region
        })
      }
    : toUkAddress(address)
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
 * @template {string | number} K
 * @param {T[]} items
 * @param {(item: T) => [K, V] | null} toEntry
 * @param {string} keyName
 * @param {OnDrop} onDrop
 * @returns {Record<K, V>}
 */
function keyedRecords(items, toEntry, keyName, onDrop) {
  const entries = items.map(toEntry).filter((entry) => entry !== null)
  const keys = entries.map(([key]) => key)
  const clashes = new Set(keys.filter((key, i) => keys.indexOf(key) !== i))
  for (const key of clashes) {
    onDrop(`${keyName} ${key} is shared by more than one record`)
  }
  return /** @type {Record<K, V>} */ (
    Object.fromEntries(entries.filter(([key]) => !clashes.has(key)))
  )
}

/**
 * @template T, V
 * @template {string} K
 * @param {Record<K, T>} record
 * @param {(value: T) => V} map
 * @returns {Record<K, V>}
 */
function mapValues(record, map) {
  return /** @type {Record<K, V>} */ (
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, map(value)])
    )
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
