import Boom from '@hapi/boom'
import {
  ACCREDITATION_STATUS,
  ORGANISATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'

/** @import { AccreditationStatus, RegistrationStatus } from '#domain/organisations/model.js' */

const VALID_ORG_TRANSITIONS = {
  [ORGANISATION_STATUS.CREATED]: [
    ORGANISATION_STATUS.APPROVED,
    ORGANISATION_STATUS.REJECTED
  ],
  [ORGANISATION_STATUS.APPROVED]: [
    ORGANISATION_STATUS.ACTIVE,
    ORGANISATION_STATUS.CREATED
  ],
  [ORGANISATION_STATUS.ACTIVE]: [],
  [ORGANISATION_STATUS.REJECTED]: [ORGANISATION_STATUS.CREATED]
}

// Registrations cannot be suspended (PAE-1705): a registration is either live
// or terminated, so approved -> cancelled is direct and there is no suspended
// node at all.
/** @type {Record<RegistrationStatus, RegistrationStatus[]>} */
const VALID_REG_TRANSITIONS = {
  [REGISTRATION_STATUS.CREATED]: [
    REGISTRATION_STATUS.APPROVED,
    REGISTRATION_STATUS.REJECTED
  ],
  [REGISTRATION_STATUS.APPROVED]: [
    REGISTRATION_STATUS.CREATED,
    REGISTRATION_STATUS.CANCELLED
  ],
  [REGISTRATION_STATUS.CANCELLED]: [REGISTRATION_STATUS.APPROVED],
  [REGISTRATION_STATUS.REJECTED]: [REGISTRATION_STATUS.CREATED]
}

// Accreditations keep suspension and may only reach cancelled via suspended
// (ADR 0042). The registration-cancellation cascade bypasses this table by
// design — cancelling a registration force-cancels its linked accreditation.
/** @type {Record<AccreditationStatus, AccreditationStatus[]>} */
const VALID_ACC_TRANSITIONS = {
  [ACCREDITATION_STATUS.CREATED]: [
    ACCREDITATION_STATUS.APPROVED,
    ACCREDITATION_STATUS.REJECTED
  ],
  [ACCREDITATION_STATUS.APPROVED]: [
    ACCREDITATION_STATUS.SUSPENDED,
    ACCREDITATION_STATUS.CREATED
  ],
  [ACCREDITATION_STATUS.SUSPENDED]: [
    ACCREDITATION_STATUS.APPROVED,
    ACCREDITATION_STATUS.CANCELLED
  ],
  [ACCREDITATION_STATUS.CANCELLED]: [ACCREDITATION_STATUS.APPROVED],
  [ACCREDITATION_STATUS.REJECTED]: [ACCREDITATION_STATUS.CREATED]
}

export const assertOrgStatusTransitionValid = (fromStatus, toStatus) => {
  const allowedTransitions = VALID_ORG_TRANSITIONS[fromStatus]
  const isValid = allowedTransitions.includes(toStatus)

  if (!isValid) {
    throw Boom.badData(
      `Cannot transition organisation status from ${fromStatus} to ${toStatus}`
    )
  }
}

/**
 * @template {string} S
 * @typedef {(fromStatus: S, toStatus: S) => void} StatusTransitionAsserter
 */

/**
 * Widened to plain strings: callers that walk a whole status history hold
 * entries typed only as strings.
 * @typedef {(fromStatus: string, toStatus: string) => boolean} StatusTransitionPredicate
 */

/**
 * @param {Record<string, string[]>} validTransitions
 * @returns {StatusTransitionPredicate}
 */
const makeIsStatusTransitionValid =
  (validTransitions) => (fromStatus, toStatus) =>
    (validTransitions[fromStatus] ?? []).includes(toStatus)

// Exposed for callers that inspect a whole status history rather than a single
// transition, and so must report every offending pair instead of throwing on
// the first (the JSON editor's status-history guard, PAE-1809).
export const isRegistrationStatusTransitionValid = makeIsStatusTransitionValid(
  VALID_REG_TRANSITIONS
)

export const isAccreditationStatusTransitionValid = makeIsStatusTransitionValid(
  VALID_ACC_TRANSITIONS
)

/**
 * @template {string} S
 * @param {StatusTransitionPredicate} isStatusTransitionValid
 * @param {'registration' | 'accreditation'} itemKind
 * @returns {StatusTransitionAsserter<S>}
 */
const makeAssertStatusTransitionValid = (isStatusTransitionValid, itemKind) => {
  return (fromStatus, toStatus) => {
    if (!isStatusTransitionValid(fromStatus, toStatus)) {
      throw Boom.badData(
        `Cannot transition ${itemKind} status from ${fromStatus} to ${toStatus}`
      )
    }
  }
}

export const assertRegistrationStatusTransitionValid =
  makeAssertStatusTransitionValid(
    isRegistrationStatusTransitionValid,
    'registration'
  )

export const assertAccreditationStatusTransitionValid =
  makeAssertStatusTransitionValid(
    isAccreditationStatusTransitionValid,
    'accreditation'
  )
