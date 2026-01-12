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
  [ORGANISATION_STATUS.APPROVED]: [ORGANISATION_STATUS.ACTIVE],
  [ORGANISATION_STATUS.ACTIVE]: [],
  [ORGANISATION_STATUS.REJECTED]: [ORGANISATION_STATUS.CREATED]
}

const VALID_REG_ACC_TRANSITIONS = {
  [REG_ACC_STATUS.CREATED]: [REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.REJECTED],
  [REG_ACC_STATUS.APPROVED]: [REG_ACC_STATUS.SUSPENDED, REG_ACC_STATUS.CREATED],
  [REG_ACC_STATUS.SUSPENDED]: [
    REG_ACC_STATUS.APPROVED,
    REG_ACC_STATUS.CANCELLED
  ],
  [REG_ACC_STATUS.CANCELLED]: [],
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

export const assertRegAccStatusTransitionValid = (fromStatus, toStatus) => {
  const allowedTransitions = VALID_REG_ACC_TRANSITIONS[fromStatus]
  const isValid = allowedTransitions.includes(toStatus)

  if (!isValid) {
    throw Boom.badData(
      `Cannot transition registration/accreditation status from ${fromStatus} to ${toStatus}`
    )
  }
}
