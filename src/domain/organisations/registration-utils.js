import {
  ACTIVE_ACCREDITATION_STATUSES,
  MATERIAL,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

/** @import { AccreditationStatus, GlassRecyclingProcess, Material, Organisation, RegistrationStatus, ResolvedMaterial } from '#domain/organisations/model.js' */
/** @import { ReportableRegistration } from '#domain/organisations/registration.js' */
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
 * Returns the material the record is for, or null when it is for none yet.
 *
 * Glass is the only material that sub-divides. A glass submission is split
 * upstream into one record per recycling process, so a glass record is for the
 * precise material named by the single process it carries. One that carries no
 * process, or more than one, has not been split, and so is not yet for either
 * of them. All other materials are their own answer.
 *
 * @param {{ material: Material, glassRecyclingProcess?: GlassRecyclingProcess[] | null }} record
 * @returns {ResolvedMaterial | null}
 */
export function resolveDetailedMaterial(record) {
  if (record.material !== MATERIAL.GLASS) {
    return record.material
  }

  const [process, ...furtherProcesses] = record.glassRecyclingProcess ?? []
  return process !== undefined && furtherProcesses.length === 0 ? process : null
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
 * Returns the accreditations the registration holds.
 *
 * `registration.accreditationId` names at most one, so the result holds no
 * more than one entry. The result is a collection because a registration will
 * hold several once the model carries them.
 *
 * @param {{ accreditationId?: string | null }} registration
 * @param {{ accreditations: Accreditation[] }} org
 * @returns {Accreditation[]}
 */
export function accreditationsForRegistration(registration, org) {
  const { accreditationId } = registration
  if (!accreditationId) {
    return []
  }

  return org.accreditations.filter(
    (accreditation) => accreditation.id === accreditationId
  )
}
