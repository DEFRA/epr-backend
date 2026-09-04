import { toCalendarDate } from '#common/helpers/date-formatter.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'

import {
  formatStatusHistory,
  occurrencesOf,
  linkedAccreditation
} from './shared.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {StreamUsage} from '#stream-transition-diagnostic/repository/stream-usage-query.mongodb.js' */

/**
 * @typedef {Object} StreamTransitionReport
 * @property {string} organisationId
 * @property {number} orgId
 * @property {string} orgName
 * @property {string} registrationId
 * @property {string | null} registrationNumber
 * @property {string} accreditationId
 * @property {string | null} accreditationNumber
 * @property {'registered_to_accredited' | 'accredited_to_registered'} direction
 * @property {number} registeredOnlySubmissions
 * @property {number} accreditedSubmissions
 * @property {string} registeredOnlyLastSubmittedAt
 * @property {string} accreditedFirstSubmittedAt
 * @property {string} registrationHistory
 * @property {string} accreditationHistory
 * @property {string | null} material
 */

/**
 * @param {ReturnType<typeof occurrencesOf>} transition
 * @param {number} submissionAt
 * @returns {boolean}
 */
const submissionPrecedesTransition = (transition, submissionAt) =>
  transition.everHeld &&
  transition.latestUpdatedAt !== null &&
  submissionAt < transition.latestUpdatedAt

/**
 * @param {StreamUsage} usage
 * @param {Organisation} org
 * @param {import('#domain/organisations/registration.js').Registration} registration
 * @param {import('#domain/organisations/accreditation.js').Accreditation} accreditation
 * @returns {Omit<StreamTransitionReport, 'direction'>}
 */
const baseReport = (usage, org, registration, accreditation) => ({
  organisationId: usage.organisationId,
  orgId: org.orgId,
  orgName: org.companyDetails?.name ?? null,
  registrationId: usage.registrationId,
  registrationNumber: usage.registrationNumbers[0] ?? null,
  accreditationId: accreditation.id,
  accreditationNumber: usage.accreditationNumbers[0] ?? null,
  registeredOnlySubmissions: usage.registeredOnlySubmissions,
  accreditedSubmissions: usage.accreditedSubmissions,
  registeredOnlyLastSubmittedAt: toCalendarDate(
    new Date(usage.registeredOnlyLastSubmittedAt)
  ),
  accreditedFirstSubmittedAt: toCalendarDate(
    new Date(usage.accreditedFirstSubmittedAt)
  ),
  registrationHistory: formatStatusHistory(registration.statusHistory),
  accreditationHistory: formatStatusHistory(accreditation.statusHistory),
  material: registration.material ?? null
})

/**
 * Builds one report per direction an organisation's registration has
 * switched streams in. An org that has gone both ways yields two reports.
 * Direction is decided by comparing the accreditation's approved/cancelled
 * transition against which stream's submissions sit on which side of it —
 * not from row dates, which this diagnostic does not read.
 *
 * A usage row with no linked accreditation, or an accreditation with no
 * `approved`/`cancelled` history entry at all, cannot be assigned a
 * direction and is skipped: `usages` is already restricted to pairs
 * submitting under both streams, but the stream-vs-accreditation-status
 * correspondence still requires the accreditation to exist and have a
 * dateable transition.
 *
 * @param {StreamUsage} usage
 * @param {Organisation | undefined} org
 * @returns {StreamTransitionReport[]}
 */
const reportsForUsage = (usage, org) => {
  const registration = org?.registrations.find(
    (reg) => reg.id === usage.registrationId
  )
  const accreditation =
    org && registration ? linkedAccreditation(registration, org) : null
  if (!org || !registration || !accreditation) {
    return []
  }

  const approved = occurrencesOf(
    accreditation.statusHistory,
    ACCREDITATION_STATUS.APPROVED
  )
  const cancelled = occurrencesOf(
    accreditation.statusHistory,
    ACCREDITATION_STATUS.CANCELLED
  )
  const registeredOnlyAt = new Date(
    usage.registeredOnlyLastSubmittedAt
  ).getTime()
  const accreditedAt = new Date(usage.accreditedFirstSubmittedAt).getTime()
  const base = baseReport(usage, org, registration, accreditation)

  /** @type {StreamTransitionReport[]} */
  const reports = []

  // registered→accredited: the accreditation was approved, and the
  // registered-only stream's last submission precedes that approval.
  if (submissionPrecedesTransition(approved, registeredOnlyAt)) {
    reports.push({ ...base, direction: 'registered_to_accredited' })
  }

  // accredited→registered: the accreditation was cancelled, and the
  // accredited stream's first submission precedes that cancellation.
  if (submissionPrecedesTransition(cancelled, accreditedAt)) {
    reports.push({ ...base, direction: 'accredited_to_registered' })
  }

  return reports
}

/**
 * @typedef {Object} StreamTransitionSummary
 * @property {number} scanned
 * @property {number} affectedOrganisations
 * @property {number} registeredToAccredited
 * @property {number} accreditedToRegistered
 * @property {number} registeredOnlySubmissions
 * @property {number} accreditedSubmissions
 */

/**
 * @param {{ scanned: number, usages: StreamUsage[] }} streamUsage
 * @param {Organisation[]} organisations
 * @returns {{ reports: StreamTransitionReport[], summary: StreamTransitionSummary }}
 */
export const diagnoseStreamTransitions = (
  { scanned, usages },
  organisations
) => {
  const orgsById = new Map(organisations.map((org) => [org.id, org]))

  const reports = usages.flatMap((usage) =>
    reportsForUsage(usage, orgsById.get(usage.organisationId))
  )

  const affectedOrganisations = new Set(reports.map((r) => r.organisationId))
    .size

  const summary = {
    scanned,
    affectedOrganisations,
    registeredToAccredited: reports.filter(
      (r) => r.direction === 'registered_to_accredited'
    ).length,
    accreditedToRegistered: reports.filter(
      (r) => r.direction === 'accredited_to_registered'
    ).length,
    registeredOnlySubmissions: reports.reduce(
      (sum, r) => sum + r.registeredOnlySubmissions,
      0
    ),
    accreditedSubmissions: reports.reduce(
      (sum, r) => sum + r.accreditedSubmissions,
      0
    )
  }

  return { reports, summary }
}
