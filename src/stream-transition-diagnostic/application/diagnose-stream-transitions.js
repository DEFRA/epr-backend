import { toCalendarDate } from '#common/helpers/date-formatter.js'

import { formatStatusHistory, linkedAccreditation } from './shared.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {StreamUsage} from '#stream-transition-diagnostic/repository/stream-usage-query.mongodb.js' */

/**
 * @typedef {Object} StreamTransitionReport
 * @property {string} organisationId
 * @property {number} orgId
 * @property {string | null} orgName
 * @property {string} registrationId
 * @property {string | null} registrationNumber
 * @property {string | null} accreditationId
 * @property {string | null} accreditationNumber
 * @property {number} registeredOnlySubmissions
 * @property {number} accreditedSubmissions
 * @property {string} registeredOnlyFirstSubmittedAt
 * @property {string} registeredOnlyLastSubmittedAt
 * @property {string} accreditedFirstSubmittedAt
 * @property {string} accreditedLastSubmittedAt
 * @property {string} registrationHistory
 * @property {string} accreditationHistory
 * @property {string | null} material
 */

/**
 * @param {StreamUsage} usage
 * @param {Organisation} org
 * @param {import('#domain/organisations/registration.js').Registration} registration
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} accreditation
 * @returns {StreamTransitionReport}
 */
const buildReport = (usage, org, registration, accreditation) => ({
  organisationId: usage.organisationId,
  orgId: org.orgId,
  orgName: org.companyDetails?.name ?? null,
  registrationId: usage.registrationId,
  registrationNumber: usage.registrationNumbers[0] ?? null,
  accreditationId: accreditation?.id ?? null,
  accreditationNumber: usage.accreditationNumbers[0] ?? null,
  registeredOnlySubmissions: usage.registeredOnlySubmissions,
  accreditedSubmissions: usage.accreditedSubmissions,
  registeredOnlyFirstSubmittedAt: toCalendarDate(
    new Date(usage.registeredOnlyFirstSubmittedAt)
  ),
  registeredOnlyLastSubmittedAt: toCalendarDate(
    new Date(usage.registeredOnlyLastSubmittedAt)
  ),
  accreditedFirstSubmittedAt: toCalendarDate(
    new Date(usage.accreditedFirstSubmittedAt)
  ),
  accreditedLastSubmittedAt: toCalendarDate(
    new Date(usage.accreditedLastSubmittedAt)
  ),
  registrationHistory: formatStatusHistory(registration.statusHistory),
  accreditationHistory: formatStatusHistory(accreditation?.statusHistory),
  material: registration.material ?? null
})

/**
 * Reports every usage row spanning both streams as-is, with no inferred
 * direction — accreditationNumber is never removed once granted (see
 * `validateAccreditationNumbersRetained`), so direction can't be inferred
 * safely; a human judges each case from the reported status trails.
 *
 * @param {StreamUsage} usage
 * @param {Organisation | undefined} org
 * @returns {StreamTransitionReport | null}
 */
const reportForUsage = (usage, org) => {
  const registration = org?.registrations.find(
    (reg) => reg.id === usage.registrationId
  )
  if (!org || !registration) {
    return null
  }

  const accreditation = linkedAccreditation(registration, org)

  return buildReport(usage, org, registration, accreditation)
}

/**
 * @typedef {Object} StreamTransitionSummary
 * @property {number} scanned
 * @property {number} affectedOrganisations
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

  const reports = usages
    .map((usage) => reportForUsage(usage, orgsById.get(usage.organisationId)))
    .filter((report) => report !== null)

  const affectedOrganisations = new Set(reports.map((r) => r.organisationId))
    .size

  const summary = {
    scanned,
    affectedOrganisations,
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
