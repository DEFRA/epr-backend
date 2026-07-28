import Boom from '@hapi/boom'
import {
  LIFECYCLE_DECISION,
  LIFECYCLE_REFUSAL,
  decideOrganisationStatusChange
} from '#domain/organisations/lifecycle.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {OrganisationStatusRefusal} from '#domain/organisations/lifecycle.js' */
/** @import {StatusTransitionAsserter} from '#domain/organisations/status.js' */

/**
 * @type {Record<OrganisationStatusRefusal, (existing: Organisation, requested: Organisation) => Error>}
 */
const ORGANISATION_STATUS_ERRORS = {
  [LIFECYCLE_REFUSAL.INVALID_TRANSITION]: (existing, requested) =>
    Boom.badData(
      `Cannot transition organisation status from ${existing.status} to ${requested.status}`
    ),
  [LIFECYCLE_REFUSAL.NO_APPROVED_REGISTRATION]: () =>
    Boom.badData(
      'Cannot approve organisation without at least one approved registration',
      { statusCode: 422 }
    ),
  [LIFECYCLE_REFUSAL.NOT_LINKED_TO_DEFRA_ORGANISATION]: () =>
    Boom.badData(
      'Cannot activate organisation without linking to a Defra organisation',
      { statusCode: 422 }
    )
}

/**
 * @param {Organisation} existing
 * @param {Organisation} requested
 * @returns {void}
 */
export const assertOrgStatusTransition = (existing, requested) => {
  const decision = decideOrganisationStatusChange(existing, requested)

  if (decision.outcome === LIFECYCLE_DECISION.REFUSED) {
    throw ORGANISATION_STATUS_ERRORS[decision.reason](existing, requested)
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
