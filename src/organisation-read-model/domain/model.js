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
 *   organisationNumber: number
 *   registeredAddress?: UkAddress
 *   registrations: Record<string, Registration>
 *   status: 'created' | 'approved' | 'active' | 'rejected'
 *   statusTimeline: StatusTimeline
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
 *   status: 'approved' | 'cancelled'
 *   statusTimeline: StatusTimeline
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
 *   accreditationNumber: string
 *   prnIssuance: { signatories: Contact[], tonnageBand: string }
 *   status: 'approved' | 'suspended' | 'cancelled'
 *   statusTimeline: StatusTimeline
 *   submitterContactDetails: Contact
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
 * One status per day, keyed by ISO 8601 date (ADR-0051).
 *
 * @typedef {Record<string, { status: string }>} StatusTimeline
 */

/** @type {readonly Organisation['status'][]} */
export const ORGANISATION_STATUSES = Object.freeze([
  'created',
  'approved',
  'active',
  'rejected'
])

/** @type {readonly Registration['status'][]} */
export const REGISTRATION_STATUSES = Object.freeze(['approved', 'cancelled'])

/** @type {readonly AccreditationCommon['status'][]} */
export const ACCREDITATION_STATUSES = Object.freeze([
  'approved',
  'suspended',
  'cancelled'
])

/**
 * The status at the latest date on or before `date`.
 *
 * @param {StatusTimeline} timeline
 * @param {string} date - ISO 8601 date
 * @returns {string | undefined}
 */
export const statusOn = (timeline, date) => {
  const day = Object.keys(timeline)
    .filter((key) => key <= date)
    .sort()
    .at(-1)
  return day === undefined ? undefined : timeline[day].status
}
