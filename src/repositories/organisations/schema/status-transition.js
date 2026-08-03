import Boom from '@hapi/boom'
import { assertOrgStatusTransitionValid } from '#domain/organisations/status.js'
import {
  ACCREDITATION_STATUS,
  ACTIVE_ACCREDITATION_STATUSES,
  ORGANISATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'

/** @import {Organisation, OrganisationUpdate} from '#domain/organisations/model.js' */
/** @import {StatusTransitionAsserter} from '#domain/organisations/status.js' */
/** @import {RegistrationUpdate} from '#domain/organisations/registration.js' */
/** @import {AccreditationUpdate} from '#domain/organisations/accreditation.js' */

/**
 * @param {OrganisationUpdate} updated
 * @returns {void}
 */
const requireApprovedRegistration = (updated) => {
  const hasApproved = updated.registrations.some(
    (reg) => reg.status === REGISTRATION_STATUS.APPROVED
  )

  if (!hasApproved) {
    throw Boom.badData(
      'Cannot approve organisation without at least one approved registration',
      { statusCode: 422 }
    )
  }
}

/**
 * @param {OrganisationUpdate} updated
 * @returns {void}
 */
const requireLinkedDefraOrg = (updated) => {
  if (
    !updated.linkedDefraOrganisation ||
    Object.keys(updated.linkedDefraOrganisation).length === 0
  ) {
    throw Boom.badData(
      'Cannot activate organisation without linking to a Defra organisation',
      { statusCode: 422 }
    )
  }
}

/**
 * Validates organisation status transitions and ensures required conditions are met
 * @param {Organisation} existing
 * @param {OrganisationUpdate} updated
 * @returns {void}
 */
export const assertOrgStatusTransition = (existing, updated) => {
  // If no status change requested (undefined or same), skip validation
  if (!updated.status || existing.status === updated.status) {
    return
  }

  assertOrgStatusTransitionValid(existing.status, updated.status)

  if (updated.status === ORGANISATION_STATUS.APPROVED) {
    requireApprovedRegistration(updated)
  }

  if (updated.status === ORGANISATION_STATUS.ACTIVE) {
    requireLinkedDefraOrg(updated)
  }
}

/**
 * @template {string} S
 * @param {{ status: S }} existing
 * @param {{ status?: S }} updated
 * @param {StatusTransitionAsserter<S>} assertStatusTransitionValid
 * @returns {void}
 */
export const assertAndHandleItemStateTransition = (
  existing,
  updated,
  assertStatusTransitionValid
) => {
  // If no status change requested (undefined or same), skip validation
  if (!updated.status || existing.status === updated.status) {
    return
  }
  assertStatusTransitionValid(existing.status, updated.status)
}

/**
 * @param {RegistrationUpdate} registration
 * @returns {boolean}
 */
const isRegistrationCancelled = (registration) =>
  registration.status === REGISTRATION_STATUS.CANCELLED

/**
 * Cancelling a registration force-cancels its linked accreditation, whether
 * that accreditation is approved or suspended (PAE-1705 Scenario 5). An
 * accreditation that was never live (created or rejected) is left untouched.
 * The returned cascadeCancelledIds mark the force-cancelled accreditations as
 * system-driven changes, exempt from the accreditation transition table —
 * which deliberately has no direct approved -> cancelled arc for user-driven
 * updates (ADR 0042).
 * @param {RegistrationUpdate[]} registrations
 * @param {AccreditationUpdate[]} accreditations
 * @returns {{ accreditations: AccreditationUpdate[], cascadeCancelledIds: Set<string> }}
 */
export const applyRegistrationStatusToLinkedAccreditations = (
  registrations,
  accreditations
) => {
  /** @type {Set<string>} */
  const linkedToCancelledRegistration = new Set()

  for (const reg of registrations) {
    if (reg.accreditationId && isRegistrationCancelled(reg)) {
      linkedToCancelledRegistration.add(reg.accreditationId)
    }
  }

  /** @type {Set<string>} */
  const cascadeCancelledIds = new Set()

  const updatedAccreditations = accreditations.map((acc) => {
    // Liveness is judged on the incoming payload status, so an update that
    // proposes no status for an accreditation leaves it out of the cascade.
    if (
      linkedToCancelledRegistration.has(acc.id) &&
      acc.status !== undefined &&
      ACTIVE_ACCREDITATION_STATUSES.has(acc.status)
    ) {
      cascadeCancelledIds.add(acc.id)
      return /** @type {AccreditationUpdate} */ ({
        ...acc,
        status: ACCREDITATION_STATUS.CANCELLED
      })
    }
    return acc
  })

  return { accreditations: updatedAccreditations, cascadeCancelledIds }
}
