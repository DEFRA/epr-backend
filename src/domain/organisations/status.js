import Boom from '@hapi/boom'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'

/**
 * @import {Organisation} from '#repositories/organisations/port.js'
 */

const VALID_ORG_TRANSITIONS = {
  [ORGANISATION_STATUS.CREATED]: [
    ORGANISATION_STATUS.APPROVED,
    ORGANISATION_STATUS.REJECTED
  ],
  [ORGANISATION_STATUS.APPROVED]: [ORGANISATION_STATUS.ACTIVE],
  [ORGANISATION_STATUS.ACTIVE]: [],
  [ORGANISATION_STATUS.REJECTED]: [ORGANISATION_STATUS.CREATED]
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
