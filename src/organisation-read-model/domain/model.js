import { calendarDate } from '#common/helpers/date-formatter.js'
/** @import { AccreditationNumber, OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */

/**
 * The organisation read model (ADR-0052).
 *
 * @typedef {{
 *   address?: OrganisationAddress
 *   companiesHouseNumber?: string
 *   linkedDefraOrganisation?: {
 *     defraOrganisation: { id: string, name: string }
 *     linkedAt: string
 *     linkedBy: {
 *       email: string
 *       id: string
 *     }
 *   }
 *   name: string
 *   organisationNumber: OrganisationNumber
 *   registeredAddress?: OrganisationAddress
 *   registrations: Record<string, Registration>
 *   status: Status<OrganisationStatus>
 *   submittedToRegulator: Regulator
 *   submitterContactDetails: Contact
 *   tradingName?: string
 *   users: { contactId?: string, email: string, fullName: string, roles: string[] }[]
 *   version: number
 * }} Organisation
 *
 * @typedef {{ code: 'ea' | 'nrw' | 'sepa' | 'niea' }} Regulator
 *
 * @typedef {ReprocessorRegistration | ExporterRegistration} Registration
 *
 * @typedef {{
 *   applicationContactDetails: Contact
 *   approvedPersons: Contact[]
 *   material: 'aluminium' | 'fibre' | 'glass_re_melt' | 'glass_other' | 'paper' | 'plastic'
 *     | 'steel' | 'wood'
 *   standingByDate: StandingByYear
 *   status: Status<RegistrationStatus>
 *   submittedToRegulator: Regulator
 *   submitterContactDetails: Contact
 * }} RegistrationCommon
 *
 * @typedef {RegistrationCommon & {
 *   accreditations: Record<string, ReprocessorAccreditation>
 *   reprocessingType: 'input' | 'output'
 *   site: { address: UkAddress }
 *   wasteProcessingType: 'reprocessor'
 * }} ReprocessorRegistration
 *
 * @typedef {RegistrationCommon & {
 *   accreditations: Record<string, ExporterAccreditation>
 *   overseasSites: Record<string, OverseasSite>
 *   wasteProcessingType: 'exporter'
 * }} ExporterRegistration
 *
 * @typedef {{
 *   address: OverseasAddress
 *   coordinates?: string
 *   name: string
 *   validFrom?: string
 * }} OverseasSite
 *
 * @typedef {{
 *   accreditationNumber: AccreditationNumber
 *   prnIssuance: { tonnageBand: string }
 *   status: Status<AccreditationStatus>
 * }} AccreditationCommon
 *
 * @typedef {AccreditationCommon} ReprocessorAccreditation
 *
 * @typedef {AccreditationCommon & {
 *   overseasSites: Record<string, AccreditedOverseasSite>
 * }} ExporterAccreditation
 *
 * @typedef {
 *   | { status: 'pending' }
 *   | { approvedOn: string, status: 'approved' }
 * } AccreditedOverseasSite
 *
 * @typedef {{ country?: string, region?: string } & (
 *   | {
 *       county?: string
 *       fullAddress?: string
 *       line1: string
 *       line2?: string
 *       postcode: string
 *       town?: string
 *     }
 *   | { fullAddress: string }
 * )} UkAddress
 *
 * A non-UK organisation may have no postcode.
 *
 * @typedef {{ country?: string, region?: string } & (
 *   | {
 *       county?: string
 *       fullAddress?: string
 *       line1: string
 *       line2?: string
 *       postcode?: string
 *       town?: string
 *     }
 *   | { fullAddress: string }
 * )} OrganisationAddress
 *
 * @typedef {{
 *   country: string
 *   line1: string
 *   line2?: string
 *   postcode?: string
 *   stateOrRegion?: string
 *   townOrCity: string
 * }} OverseasAddress
 *
 * @typedef {{ email: string, fullName: string, phone?: string }} Contact
 */

/**
 * Every status change, oldest first, each `at` the ISO 8601 datetime it takes
 * effect. Nothing requires two changes to happen at different times, so
 * changes that share a time keep the order they were recorded in.
 *
 * @template {string} [S=string]
 * @typedef {{ status: S, at: string }[]} StatusTimeline
 */

/**
 * The status today, the timeline it is read from, and when the timeline's
 * last change was recorded.
 *
 * @template {string} S
 * @typedef {{ current: S, lastUpdatedAt: string | undefined, timeline: StatusTimeline<S> }} Status
 */

/**
 * The statuses the read model serves for each record.
 *
 * @typedef {'created' | 'approved' | 'active' | 'rejected'} OrganisationStatus
 * @typedef {'approved' | 'cancelled'} RegistrationStatus
 * @typedef {'approved' | 'suspended' | 'cancelled'} AccreditationStatus
 */

/** @type {readonly OrganisationStatus[]} */
export const ORGANISATION_STATUSES = Object.freeze([
  'created',
  'approved',
  'active',
  'rejected'
])

/** @type {readonly RegistrationStatus[]} */
export const REGISTRATION_STATUSES = Object.freeze(['approved', 'cancelled'])

/** @type {readonly AccreditationStatus[]} */
export const ACCREDITATION_STATUSES = Object.freeze([
  'approved',
  'suspended',
  'cancelled'
])

/**
 * @typedef {typeof STANDING[keyof typeof STANDING]} Standing
 */

/**
 * By year, the date each standing starts. A standing holds until the next date,
 * or the end of the year.
 *
 * @typedef {Record<string, Record<string, { standing: Standing }>>} StandingByYear
 */

export const STANDING = Object.freeze({
  REGISTERED_ONLY: 'registeredOnly',
  ACCREDITED: 'accredited',
  CANCELLED: 'cancelled'
})

/**
 * A suspended accreditation is still accredited.
 *
 * @type {ReadonlySet<string>}
 */
export const HELD_ACCREDITATION_STATUSES = new Set(['approved', 'suspended'])

/**
 * The status at the end of the latest day on or before `date`.
 *
 * @param {StatusTimeline} timeline
 * @param {CalendarDate} date - ISO 8601 date
 * @returns {string | undefined}
 */
export const statusOn = (timeline, date) =>
  timeline.findLast(({ at }) => calendarDate(at).localeCompare(date) <= 0)
    ?.status
