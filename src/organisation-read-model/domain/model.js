import { calendarDate } from '#common/helpers/date-formatter.js'
/** @import { AccreditationNumber, OrganisationNumber } from '#domain/organisations/numbers.js' */

/**
 * The organisation read model (ADR-0052).
 *
 * @typedef {{
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
 *   registeredAddress?: UkAddress
 *   registrations: Record<string, Registration>
 *   status: Status<'created' | 'approved' | 'active' | 'rejected'>
 *   submittedToRegulator: Regulator
 *   submitterContactDetails: Contact
 *   tradingName?: string
 *   users: { contactId?: string, email: string, roles: string[] }[]
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
 *   status: Status<'approved' | 'cancelled'>
 *   submittedToRegulator: Regulator
 *   submitterContactDetails: Contact
 *   validFrom: string
 * }} RegistrationCommon
 *
 * @typedef {RegistrationCommon & {
 *   accreditations: Record<string, ReprocessorAccreditation>
 *   reprocessingType: 'input' | 'output'
 *   site: {
 *     address: UkAddress & {
 *       country?: string
 *       region?: string
 *     }
 *   }
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
 * }} OverseasSite
 *
 * @typedef {{
 *   accreditationNumber: AccreditationNumber
 *   prnIssuance: { signatories: Contact[], tonnageBand: string }
 *   status: Status<'approved' | 'suspended' | 'cancelled'>
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
 * @typedef {
 *   | {
 *       county?: string
 *       line1: string
 *       line2?: string
 *       postcode: string
 *       town: string
 *     }
 *   | { fullAddress: string }
 * } UkAddress
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
 * Every status change, oldest first, each at its ISO 8601 datetime. Nothing
 * requires two changes to happen at different times, so changes that share a
 * time keep the order they were recorded in.
 *
 * @typedef {{ status: string, at: string }[]} StatusTimeline
 */

/**
 * The status today, and the timeline it is read from.
 *
 * @template {string} S
 * @typedef {{ current: S, timeline: StatusTimeline }} Status
 */

/** @type {readonly Organisation['status']['current'][]} */
export const ORGANISATION_STATUSES = Object.freeze([
  'created',
  'approved',
  'active',
  'rejected'
])

/** @type {readonly Registration['status']['current'][]} */
export const REGISTRATION_STATUSES = Object.freeze(['approved', 'cancelled'])

/** @type {readonly AccreditationCommon['status']['current'][]} */
export const ACCREDITATION_STATUSES = Object.freeze([
  'approved',
  'suspended',
  'cancelled'
])

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
 * @param {string} date - ISO 8601 date
 * @returns {string | undefined}
 */
export const statusOn = (timeline, date) =>
  timeline.findLast(({ at }) => calendarDate(at).localeCompare(date) <= 0)
    ?.status
