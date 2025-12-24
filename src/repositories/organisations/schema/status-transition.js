import Boom from '@hapi/boom'
import { assertOrgStatusTransitionValid } from '#domain/organisations/status.js'
import { ORGANISATION_STATUS, STATUS } from '#domain/organisations/model.js'

/**
 * @param {Organisation} existing
 * @returns {void}
 */
const requireApprovedRegistration = (existing) => {
  const hasApproved = existing.registrations.some(
    (reg) => reg.status === STATUS.APPROVED
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
