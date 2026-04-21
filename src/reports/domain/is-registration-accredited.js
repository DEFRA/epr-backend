import { REG_ACC_STATUS } from '#domain/organisations/model.js'

/**
 * Returns true when the registration is linked to an accreditation that is
 * live (approved or suspended). Presence of accreditationId alone is not
 * sufficient — an accreditation in 'created', 'rejected', or 'cancelled'
 * state has never been active and must be treated as registered-only.
 *
 * @param {{ accreditation?: { status?: string } | null }} [registration]
 * @returns {boolean}
 */
export function isRegistrationAccredited(registration) {
  const status = registration?.accreditation?.status

  return (
    status === REG_ACC_STATUS.APPROVED || status === REG_ACC_STATUS.SUSPENDED
  )
}
