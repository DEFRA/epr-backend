import { toCalendarDate } from '#common/helpers/date-formatter.js'
import { deriveAccreditationYear } from '#common/helpers/dates/accreditation.js'
import { latestOpenYear } from '#common/helpers/dates/latest-open-year.js'
import {
  earliestOfYearEndOrDate,
  lastDayOfYear
} from '#common/helpers/dates/year.js'
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
import { standingByYear } from '#organisation-read-model/domain/registration-standing.js'
import { approvedYears } from '#organisation-read-model/domain/status-timeline.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Accreditation as StoredAccreditation, StatusHistoryEntryOf } from '#domain/organisations/accreditation.js' */
/** @import { Address, StoredLinkedDefraOrganisation, Organisation as StoredOrganisation, User } from '#domain/organisations/model.js' */
/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { Registration as StoredRegistration } from '#domain/organisations/registration.js' */
/** @import { AccreditationCommon, AccreditedOverseasSite, Contact, ExporterAccreditation, ExporterRegistration, Organisation, OrganisationAddress, OverseasSite, Registration, RegistrationCommon, ReprocessorAccreditation, ReprocessorRegistration, StatusTimeline, UkAddress } from '#organisation-read-model/domain/model.js' */
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
 * A registration's accreditation for a year, held outside the REEX database.
 *
 * @typedef {(ReprocessorAccreditation | ExporterAccreditation) & {
 *   registrationNumber: RegistrationNumber
 *   year: Year
 * }} ExternalAccreditation
 */

/**
 * @typedef {Map<RegistrationNumber, Record<string, ReprocessorAccreditation | ExporterAccreditation>>} ExternalAccreditationsByRegistration
 */

/**
 * @param {ExternalAccreditation} externalAccreditation
 * @returns {ReprocessorAccreditation | ExporterAccreditation}
 */
const toAccreditationCommon = ({
  registrationNumber: _registrationNumber,
  year: _year,
  ...accreditation
}) => accreditation

/**
 * Each registration's external accreditations, keyed by year.
 *
 * @param {ExternalAccreditation[]} externalAccreditations
 * @returns {ExternalAccreditationsByRegistration}
 */
const byRegistrationAndYear = (externalAccreditations) =>
  new Map(
    [...Map.groupBy(externalAccreditations, (a) => a.registrationNumber)].map(
      ([registrationNumber, held]) => [
        registrationNumber,
        Object.fromEntries(
          held.map((a) => [String(a.year), toAccreditationCommon(a)])
        )
      ]
    )
  )

/**
 * The registration numbers granted across the stored organisations.
 *
 * @param {StoredOrganisation[]} stored
 * @returns {RegistrationNumber[]}
 */
export const registrationNumbersOf = (stored) =>
  stored.flatMap(({ registrations }) =>
    registrations.flatMap(({ registrationNumber }) => registrationNumber ?? [])
  )

/**
 * The stored organisations as the read model shows them, with the external
 * accreditations held for their registrations. An organisation the model
 * cannot represent is left out and reported through `logger.warn`. Without
 * `year`, each organisation is given in every year; with it, as it stood in
 * that year.
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
  const externalByRegistration = byRegistrationAndYear(externalAccreditations)
  return stored
    .map((organisation) =>
      toOrganisation(organisation, context, externalByRegistration)
    )
    .filter((organisation) => organisation !== null)
    .map((organisation) =>
      year === undefined
        ? organisation
        : organisationInYear(organisation, year, context)
    )
}

/**
 * The entry of `byYear` for `year`, or none when it has none for it.
 * @template T
 * @param {Record<string, T>} byYear
 * @param {Year} year
 * @returns {Record<string, T>}
 */
const onlyYear = (byYear, year) =>
  Object.hasOwn(byYear, year) ? { [year]: byYear[year] } : {}

/**
 * The organisation as it stood in `year`: registrations approved at any point
 * in it, each with only that year's accreditation and status dates.
 * Organisation and registration statuses are those on the earlier of the end
 * of `year` and `context.today`.
 *
 * @param {Organisation} organisation
 * @param {Year} year
 * @param {Context} context
 * @returns {Organisation}
 */
const organisationInYear = (organisation, year, context) => {
  const statusesAsOfDate = earliestOfYearEndOrDate(year, context.today)
  const endOfYear = lastDayOfYear(year)
  const registrations = Object.entries(organisation.registrations)
    .filter(([, registration]) =>
      approvedYears(registration.status.timeline, endOfYear).includes(year)
    )
    .map(([number, registration]) => [
      number,
      {
        ...registration,
        status: {
          ...registration.status,
          current: statusOn(registration.status.timeline, statusesAsOfDate)
        },
        accreditations: onlyYear(registration.accreditations, year),
        standingByDate: onlyYear(registration.standingByDate, year)
      }
    ])

  return {
    ...organisation,
    status: {
      ...organisation.status,
      current: /** @type {Organisation['status']['current']} */ (
        statusOn(organisation.status.timeline, statusesAsOfDate) ??
          organisation.status.current
      )
    },
    registrations: Object.fromEntries(registrations)
  }
}

/**
 * @param {StoredOrganisation} stored
 * @param {CalendarDate} date
 * @returns {boolean}
 */
export function servesOrganisationOn(stored, date) {
  return isOneOf(
    ORGANISATION_STATUSES,
    statusOn(toStatusTimeline(stored.statusHistory), date)
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
  const timeline = toStatusTimeline(stored.statusHistory)
  const status = statusOn(timeline, context.today)
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
    status: { current: status, timeline },
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
 * @param {StoredRegistration} registration
 * @param {StoredOrganisation} organisation
 * @param {Context} context
 * @param {ExternalAccreditationsByRegistration} [externalByRegistration]
 * @returns {[string, Registration] | null}
 */
export function toRegistrationEntry(
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
  const timeline = toStatusTimeline(registration.statusHistory, validFrom)
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

  const storedAccreditations = keyedRecords(
    accreditationsForRegistration(registration, organisation),
    (accreditation) => toAccreditationEntry(accreditation, context),
    `Registration ${registrationNumber} accreditation year`,
    onDrop
  )
  const externalAccreditations =
    externalByRegistration.get(registrationNumber) ?? {}
  Object.keys(externalAccreditations)
    .filter((year) => Object.hasOwn(storedAccreditations, year))
    .forEach((year) =>
      onDrop(
        `Registration ${registrationNumber} accreditation year ${year} is held as an external accreditation, so stored accreditation ${storedAccreditations[year].accreditationNumber} is dropped`
      )
    )
  const openYear = latestOpenYear()
  const accreditations = Object.fromEntries(
    Object.entries({
      ...storedAccreditations,
      ...externalAccreditations
    }).filter(([year]) => Number(year) <= openYear)
  )
  const registrationStatus = { current: status, timeline }

  /** @type {RegistrationCommon} */
  const common = {
    applicationContactDetails: toContact(applicationContactDetails),
    approvedPersons: registration.approvedPersons.map(toContact),
    material: resolveMaterial(registration),
    standingByDate: standingByYear(
      { status: registrationStatus, accreditations },
      lastDayOfYear(openYear)
    ),
    status: registrationStatus,
    submittedToRegulator: { code: registration.submittedToRegulator },
    submitterContactDetails: toContact(registration.submitterContactDetails),
    validFrom
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
 * @param {Record<string, ReprocessorAccreditation | ExporterAccreditation>} accreditations
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
 * @param {Record<string, ReprocessorAccreditation | ExporterAccreditation>} accreditations
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
    accreditations: withoutOverseasSites(
      accreditations,
      registrationNumber,
      onDrop
    )
  }
}

/**
 * @param {Record<string, ReprocessorAccreditation | ExporterAccreditation>} accreditations
 * @param {StoredRegistration['registrationNumber']} registrationNumber
 * @param {OnDrop} onDrop
 * @returns {Record<string, ReprocessorAccreditation>}
 */
function withoutOverseasSites(accreditations, registrationNumber, onDrop) {
  return Object.fromEntries(
    Object.entries(accreditations).map(([year, accreditation]) => {
      if (!('overseasSites' in accreditation)) {
        return [year, accreditation]
      }
      onDrop(
        `Registration ${registrationNumber} accreditation year ${year} lists overseas sites, but a reprocessor has none`
      )
      const { overseasSites: _overseasSites, ...reprocessorAccreditation } =
        accreditation
      return [year, reprocessorAccreditation]
    })
  )
}

/**
 * Until per-year approvals come from the registration service, an exporter's
 * accreditation without its own sites lists every registration site with the
 * site's stored approval.
 *
 * @param {Record<string, ReprocessorAccreditation | ExporterAccreditation>} accreditations
 * @param {Record<string, StoredOverseasSite>} overseasSites
 * @param {StoredRegistration} registration
 * @param {OnDrop} onDrop
 * @returns {Record<string, ExporterAccreditation>}
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
        overseasSites:
          'overseasSites' in accreditation
            ? ownSites(accreditation, year, registration, overseasSites, onDrop)
            : registrationSites
      }
    ])
  )
}

/**
 * @param {ExporterAccreditation} accreditation
 * @param {string} year
 * @param {StoredRegistration} registration
 * @param {Record<string, StoredOverseasSite>} overseasSites
 * @param {OnDrop} onDrop
 * @returns {Record<string, AccreditedOverseasSite>}
 */
function ownSites(accreditation, year, registration, overseasSites, onDrop) {
  Object.keys(accreditation.overseasSites)
    .filter((orsId) => !Object.hasOwn(registration.overseasSites ?? {}, orsId))
    .forEach((orsId) =>
      onDrop(
        `Registration ${registration.registrationNumber} accreditation year ${year} lists overseas site ${orsId}, which the registration does not hold`
      )
    )
  return Object.fromEntries(
    Object.entries(accreditation.overseasSites).filter(([orsId]) =>
      Object.hasOwn(overseasSites, orsId)
    )
  )
}

/**
 * @param {StoredAccreditation} accreditation
 * @param {Context} context
 * @returns {[string, AccreditationCommon] | null}
 */
export function toAccreditationEntry(accreditation, { onDrop }) {
  const { accreditationNumber, prnIssuance, status } = accreditation
  // Not served by design, so not logged
  if (!isOneOf(ACCREDITATION_STATUSES, status)) {
    return null
  }
  if (!accreditationNumber) {
    onDrop(`Accreditation ${accreditation.id} has no accreditation number`)
    return null
  }
  const timeline = toStatusTimeline(
    accreditation.statusHistory,
    accreditation.validFrom
  )
  if (!accreditation.validFrom) {
    onDrop(`Accreditation ${accreditationNumber} has no validFrom`)
    return null
  }

  return [
    String(deriveAccreditationYear(accreditation)),
    {
      accreditationNumber,
      prnIssuance: { tonnageBand: prnIssuance.tonnageBand },
      status: { current: status, timeline }
    }
  ]
}

/**
 * Until ADR-0051's events exist, the approval after the last `created` takes
 * effect from the record's validFrom, anything recorded before it no later than
 * that, and every other change when it was recorded.
 *
 * @param {StatusHistoryEntryOf<string>[]} statusHistory
 * @param {string} [validFrom]
 * @returns {StatusTimeline}
 */
export function toStatusTimeline(statusHistory, validFrom) {
  const recorded = statusHistory
    .map(({ status, updatedAt }) => ({
      status,
      at: new Date(updatedAt),
      updatedAt: new Date(updatedAt).toISOString()
    }))
    .toSorted(byDate)
  const lastCreated = recorded.findLastIndex(
    ({ status }) => status === 'created'
  )
  const approvalAfterLastCreated = recorded.findIndex(
    ({ status }, index) => index > lastCreated && status === 'approved'
  )
  if (approvalAfterLastCreated >= 0 && validFrom) {
    const approvedFrom = new Date(validFrom)
    for (const entry of recorded.slice(0, approvalAfterLastCreated)) {
      entry.at = entry.at < approvedFrom ? entry.at : approvedFrom
    }
    recorded[approvalAfterLastCreated].at = approvedFrom
  }
  // A stable sort keeps recorded order among equal times
  return recorded.toSorted(byDate).map(({ status, at, updatedAt }) => ({
    status,
    at: at.toISOString(),
    updatedAt
  }))
}

/**
 * @param {{ at: Date }} one
 * @param {{ at: Date }} other
 * @returns {number}
 */
const byDate = (one, other) => one.at.getTime() - other.at.getTime()

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
