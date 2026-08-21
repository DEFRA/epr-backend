import {
  ACTIVE_ACCREDITATION_STATUSES,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { isAccreditationForRegistration } from '#formsubmission/submission-keys.js'

/** @import { AccreditationStatus, GlassRecyclingProcess, Material, Organisation, RegistrationStatus } from '#domain/organisations/model.js' */
/** @import { Registration, ReportableRegistration } from '#domain/organisations/registration.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

/** @type {Set<RegistrationStatus>} */
const REPORTABLE_STATUSES = new Set([
  REGISTRATION_STATUS.APPROVED,
  REGISTRATION_STATUS.CANCELLED
])

/**
 * Returns all reportable (approved/cancelled) registrations across all non-test organisations.
 *
 * @param {Organisation[]} orgs
 * @returns {Array<{ org: Organisation, registration: ReportableRegistration }>}
 */
export function getReportableRegistrations(orgs) {
  return orgs
    .filter((org) => !TEST_ORGANISATIONS.has(org.orgId))
    .flatMap((org) =>
      org.registrations
        .filter((registration) => REPORTABLE_STATUSES.has(registration.status))
        .map((registration) => ({
          org,
          registration: /** @type {ReportableRegistration} */ (registration)
        }))
    )
}

/**
 * Returns the accreditationNumber for the registration's linked accreditation,
 * or '' when no active (approved/suspended) accreditation is found.
 *
 * @param {{ accreditationId?: string | null }} registration
 * @param {{ accreditations: Array<{ id: string, status: AccreditationStatus, accreditationNumber?: string | null }> }} org
 * @returns {string}
 */
export function resolveAccreditationNumber(registration, org) {
  if (!registration.accreditationId) {
    return ''
  }
  const accreditation = org.accreditations.find(
    (a) =>
      a.id === registration.accreditationId &&
      ACTIVE_ACCREDITATION_STATUSES.has(a.status)
  )
  return accreditation?.accreditationNumber ?? ''
}

/**
 * @typedef {{ accreditation: { status: AccreditationStatus } | null }} AccreditationLink
 */

/**
 * Returns true when the registration is linked to an accreditation that is
 * live (approved or suspended). Presence of accreditationId alone is not
 * sufficient — an accreditation in 'created', 'rejected', or 'cancelled'
 * state has never been active and must be treated as registered-only.
 *
 * @param {AccreditationLink} registration
 * @returns {boolean}
 */
export function isRegistrationAccredited({ accreditation }) {
  return accreditation
    ? ACTIVE_ACCREDITATION_STATUSES.has(accreditation.status)
    : false
}

/**
 * Returns the `validFrom` of a live (approved/suspended) accreditation, or null
 * when the accreditation is absent or not live. Used to bound an accredited
 * operator's monthly report obligations to the date their accreditation began.
 *
 * @param {{ status: AccreditationStatus, validFrom?: string | null } | null | undefined} accreditation
 * @returns {string | null}
 */
export function activeAccreditationValidFrom(accreditation) {
  if (
    accreditation &&
    ACTIVE_ACCREDITATION_STATUSES.has(accreditation.status)
  ) {
    return accreditation.validFrom ?? null
  }
  return null
}

/**
 * Returns the record's material at its finest granularity. Glass is the only
 * material that sub-divides: each glass record carries a single recycling
 * process (submissions are split per process upstream), so the process value
 * (glass_re_melt / glass_other) is returned in place of 'glass'.
 * All other materials are returned unchanged.
 *
 * @param {{ material: Material, glassRecyclingProcess?: GlassRecyclingProcess[] | null }} record
 * @returns {Material | GlassRecyclingProcess}
 */
export function resolveDetailedMaterial(record) {
  const glassProcess = record.glassRecyclingProcess
  if (record.material === 'glass' && glassProcess && glassProcess.length > 0) {
    return glassProcess[0]
  }
  return record.material
}

/**
 * Returns the active Accreditation object for a registration by looking up
 * accreditationId in org.accreditations. Only approved/suspended accreditations
 * are returned. Returns null when accreditationId is absent, no match is found,
 * or the matched accreditation is not in an active status.
 *
 * @param {{ accreditationId?: string | null }} registration
 * @param {{ accreditations: Array<{ id: string; status: AccreditationStatus } & Accreditation> }} org
 * @returns {Accreditation | null}
 */
export function resolveAccreditation(registration, org) {
  if (!registration.accreditationId) {
    return null
  }
  return (
    org.accreditations.find(
      (a) =>
        a.id === registration.accreditationId &&
        ACTIVE_ACCREDITATION_STATUSES.has(a.status)
    ) ?? null
  )
}

/**
 * Returns every accreditation that belongs to the registration, newest first.
 *
 * An accreditation carries no registration id, and
 * `registration.accreditationId` points forward to at most one, so a
 * registration finds the rest of its accreditations by the natural key
 * `isAccreditationForRegistration` matches on. That key is unique across
 * approved records only, so a registration can hold more than one accreditation
 * with the same key, and an accreditation no registration links to - the state
 * ORPHAN_ACCREDITATION reports - is returned when its key matches.
 *
 * Two registrations can share a key for the same reason, so an accreditation
 * another registration links to is excluded:
 * validateAccreditationLinkUniqueness holds each accreditation to at most one.
 *
 * @param {Registration} registration
 * @param {{ registrations: Registration[], accreditations: Accreditation[] }} org
 * @returns {Accreditation[]}
 */
export function accreditationsForRegistration(registration, org) {
  const claimedElsewhere = accreditationsClaimedByOtherRegistrations(
    registration,
    org
  )

  return org.accreditations
    .filter((accreditation) => !claimedElsewhere.has(accreditation.id))
    .filter((accreditation) =>
      isAccreditationForRegistration(accreditation, registration)
    )
    .sort(byNewestFirst)
}

/**
 * @param {Registration} registration
 * @param {{ registrations: Registration[] }} org
 * @returns {Set<string>}
 */
function accreditationsClaimedByOtherRegistrations(registration, org) {
  return new Set(
    org.registrations
      .filter((candidate) => candidate.id !== registration.id)
      .flatMap((candidate) => candidate.accreditationId ?? [])
  )
}

/**
 * An accreditation with no start date has no entitlement to order by, so it
 * sorts below every dated one. The id breaks a remaining tie, so accreditations
 * a regulator never numbered keep a stable order.
 *
 * @param {Accreditation} a
 * @param {Accreditation} b
 * @returns {number}
 */
function byNewestFirst(a, b) {
  return (
    (b.validFrom ?? '').localeCompare(a.validFrom ?? '') ||
    (b.accreditationNumber ?? '').localeCompare(a.accreditationNumber ?? '') ||
    b.id.localeCompare(a.id)
  )
}
