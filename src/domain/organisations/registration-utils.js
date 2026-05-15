import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { RegistrationApproved } from '#domain/organisations/registration.js' */

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

const REPORTABLE_STATUSES = new Set([
  REG_ACC_STATUS.APPROVED,
  REG_ACC_STATUS.SUSPENDED,
  REG_ACC_STATUS.CANCELLED
])

const ACTIVE_ACCREDITATION_STATUSES = new Set([
  REG_ACC_STATUS.APPROVED,
  REG_ACC_STATUS.SUSPENDED
])

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
 * @param {{ accreditations: Array<{ id: string, status: string, accreditationNumber?: string | null }> }} org
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
