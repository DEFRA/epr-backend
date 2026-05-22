import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

/** @import { Organisation, RegAccStatus } from '#domain/organisations/model.js' */
/** @import { RegistrationApproved } from '#domain/organisations/registration.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

const REPORTABLE_STATUSES = /** @type {Set<RegAccStatus>} */ (
  new Set([
    REG_ACC_STATUS.APPROVED,
    REG_ACC_STATUS.SUSPENDED,
    REG_ACC_STATUS.CANCELLED
  ])
)

const ACTIVE_ACCREDITATION_STATUSES = /** @type {Set<RegAccStatus>} */ (
  new Set([REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED])
)

/**
 * Returns all reportable (approved/suspended/cancelled) registrations across all non-test organisations.
 *
 * @param {Organisation[]} orgs
 * @returns {Array<{ org: Organisation, registration: RegistrationApproved }>}
 */
export function getReportableRegistrations(orgs) {
  return orgs
    .filter((org) => !TEST_ORGANISATIONS.has(org.orgId))
    .flatMap((org) =>
      org.registrations
        .filter((registration) => REPORTABLE_STATUSES.has(registration.status))
        .map((registration) => ({
          org,
          registration: /** @type {RegistrationApproved} */ (registration)
        }))
    )
}

/**
 * Returns the accreditationNumber for the registration's linked accreditation,
 * or '' when no active (approved/suspended) accreditation is found.
 *
 * @param {{ accreditationId?: string | null }} registration
 * @param {{ accreditations: Array<{ id: string, status: RegAccStatus, accreditationNumber?: string | null }> }} org
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
 * Returns the active Accreditation object for a registration by looking up
 * accreditationId in org.accreditations. Only approved/suspended accreditations
 * are returned. Returns null when accreditationId is absent, no match is found,
 * or the matched accreditation is not in an active status.
 *
 * @param {{ accreditationId?: string | null }} registration
 * @param {{ accreditations: Array<{ id: string; status: RegAccStatus } & Accreditation> }} org
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
