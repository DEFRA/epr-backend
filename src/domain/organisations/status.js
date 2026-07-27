import Boom from '@hapi/boom'
import {
  ORGANISATION_STATUS,
  REG_ACC_STATUS
} from '#domain/organisations/model.js'

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
const VALID_REG_TRANSITIONS = {
  [REG_ACC_STATUS.CREATED]: [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.REJECTED],
  [REG_ACC_STATUS.APPROVED]: [REG_ACC_STATUS.CREATED, REG_ACC_STATUS.CANCELLED],
  [REG_ACC_STATUS.CANCELLED]: [REG_ACC_STATUS.APPROVED],
  [REG_ACC_STATUS.REJECTED]: [REG_ACC_STATUS.CREATED]
}

// Accreditations keep suspension and may only reach cancelled via suspended
// (ADR 0042). The registration-cancellation cascade bypasses this table by
// design — cancelling a registration force-cancels its linked accreditation.
const VALID_ACC_TRANSITIONS = {
  [REG_ACC_STATUS.CREATED]: [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.REJECTED],
  [REG_ACC_STATUS.APPROVED]: [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.CREATED],
  [REG_ACC_STATUS.SUSPENDED]: [
    REG_ACC_STATUS.APPROVED,
    REG_ACC_STATUS.CANCELLED
  ],
  [REG_ACC_STATUS.CANCELLED]: [REG_ACC_STATUS.APPROVED],
  [REG_ACC_STATUS.REJECTED]: [REG_ACC_STATUS.CREATED]
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
 * @param {Record<string, string[]>} validTransitions
 * @param {'registration' | 'accreditation'} itemKind
 * @returns {(fromStatus: string, toStatus: string) => void}
 */
const makeAssertStatusTransitionValid = (validTransitions, itemKind) => {
  return (fromStatus, toStatus) => {
    const allowedTransitions = validTransitions[fromStatus] ?? []
    const isValid = allowedTransitions.includes(toStatus)

    if (!isValid) {
      throw Boom.badData(
        `Cannot transition ${itemKind} status from ${fromStatus} to ${toStatus}`
      )
    }
  }
}

export const assertRegistrationStatusTransitionValid =
  makeAssertStatusTransitionValid(VALID_REG_TRANSITIONS, 'registration')

export const assertAccreditationStatusTransitionValid =
  makeAssertStatusTransitionValid(VALID_ACC_TRANSITIONS, 'accreditation')
