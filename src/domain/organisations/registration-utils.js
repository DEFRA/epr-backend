import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

/** @import { AccreditationStatus, GlassRecyclingProcess, Material, Organisation, RegistrationStatus } from '#domain/organisations/model.js' */
/** @import { Registration, ReportableRegistration } from '#domain/organisations/registration.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

const REPORTABLE_STATUSES = /** @type {Set<RegistrationStatus>} */ (
  new Set([REGISTRATION_STATUS.APPROVED, REGISTRATION_STATUS.CANCELLED])
)

const ACTIVE_ACCREDITATION_STATUSES = /** @type {Set<AccreditationStatus>} */ (
  new Set([ACCREDITATION_STATUS.APPROVED, ACCREDITATION_STATUS.SUSPENDED])
)

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
 * Returns true when the registration is linked to an accreditation that is
 * live (approved or suspended). Presence of accreditationId alone is not
 * sufficient — an accreditation in 'created', 'rejected', or 'cancelled'
 * state has never been active and must be treated as registered-only.
 *
 * @param {{ accreditation: { status?: string } | null }} registration
 * @returns {boolean}
 */
export function isRegistrationAccredited(registration) {
  const status = registration.accreditation?.status
  return ACTIVE_ACCREDITATION_STATUSES.has(
    /** @type {AccreditationStatus} */ (status)
  )
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
    (accreditation.status === ACCREDITATION_STATUS.APPROVED ||
      accreditation.status === ACCREDITATION_STATUS.SUSPENDED)
  ) {
    return accreditation.validFrom ?? null
  }
  return null
}

/**
 * Returns the registration's material at its finest granularity. Glass is the
 * only material that sub-divides: each glass registration carries a single
 * recycling process (submissions are split per process upstream), so the
 * process value (glass_re_melt / glass_other) is returned in place of 'glass'.
 * All other materials are returned unchanged.
 *
 * @param {Pick<Registration, 'material' | 'glassRecyclingProcess'>} registration
 * @returns {Material | GlassRecyclingProcess}
 */
export function resolveDetailedMaterial(registration) {
  const glassProcess = registration.glassRecyclingProcess
  if (
    registration.material === 'glass' &&
    glassProcess &&
    glassProcess.length > 0
  ) {
    return glassProcess[0]
  }
  return registration.material
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
