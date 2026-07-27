import Boom from '@hapi/boom'
import { assertOrgStatusTransitionValid } from '#domain/organisations/status.js'
import {
  ORGANISATION_STATUS,
  REG_ACC_STATUS
} from '#domain/organisations/model.js'

/** @import {Organisation, RegAccStatus} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */

/**
 * @param {Organisation} existing
 * @returns {void}
 */
const requireApprovedRegistration = (existing) => {
  const hasApproved = existing.registrations.some(
    (reg) => reg.status === REG_ACC_STATUS.APPROVED
  )

  if (!hasApproved) {
    throw Boom.badData(
      'Cannot approve organisation without at least one approved registration',
      { statusCode: 422 }
    )
  }
}

/**
 * @param {Organisation} updated
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
 * @param {Organisation} updated
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
 * @param {{ status: string }} existing
 * @param {{ status?: string }} updated
 * @param {(fromStatus: string, toStatus: string) => void} assertStatusTransitionValid
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

const isRegistrationCancelled = (registration) =>
  registration.status === REG_ACC_STATUS.CANCELLED

// Only a live accreditation is force-cancelled by the cascade. The check runs
// against the incoming payload status so that an attempt to reinstate a
// cascade-cancelled accreditation (payload approved, registration still
// cancelled) is also caught and held at cancelled.
const CASCADEABLE_ACC_STATUSES = /** @type {Set<RegAccStatus>} */ (
  new Set([REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED])
)

/**
 * Cancelling a registration force-cancels its linked accreditation, whether
 * that accreditation is approved or suspended (PAE-1705 Scenario 5). An
 * accreditation that was never live (created or rejected) is left untouched.
 * The returned cascadeCancelledIds mark the force-cancelled accreditations as
 * system-driven changes, exempt from the accreditation transition table —
 * which deliberately has no direct approved -> cancelled arc for user-driven
 * updates (ADR 0042).
 * @param {Registration[]} registrations
 * @param {Accreditation[]} accreditations
 * @returns {{ accreditations: Accreditation[], cascadeCancelledIds: Set<string> }}
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
    if (
      linkedToCancelledRegistration.has(acc.id) &&
      CASCADEABLE_ACC_STATUSES.has(acc.status)
    ) {
      cascadeCancelledIds.add(acc.id)
      return /** @type {Accreditation} */ ({
        ...acc,
        status: REG_ACC_STATUS.CANCELLED
      })
    }
    return acc
  })

  return { accreditations: updatedAccreditations, cascadeCancelledIds }
}
