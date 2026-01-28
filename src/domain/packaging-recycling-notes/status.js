/**
 * PRN (Packaging Recycling Note) status values
 * @see docs/architecture/discovery/pepr-lld.md#PRN
 */
export const PRN_STATUS = Object.freeze({
  DRAFT: 'draft',
  AWAITING_AUTHORISATION: 'awaiting_authorisation',
  AWAITING_ACCEPTANCE: 'awaiting_acceptance',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  AWAITING_CANCELLATION: 'awaiting_cancellation',
  CANCELLED: 'cancelled',
  DELETED: 'deleted'
})

/**
 * @typedef {typeof PRN_STATUS[keyof typeof PRN_STATUS]} PrnStatus
 */

/**
 * Valid status transitions for PRNs
 */
const VALID_TRANSITIONS = {
  [PRN_STATUS.DRAFT]: [PRN_STATUS.AWAITING_AUTHORISATION, PRN_STATUS.DELETED],
  [PRN_STATUS.AWAITING_AUTHORISATION]: [
    PRN_STATUS.AWAITING_ACCEPTANCE,
    PRN_STATUS.DELETED
  ],
  [PRN_STATUS.AWAITING_ACCEPTANCE]: [
    PRN_STATUS.ACCEPTED,
    PRN_STATUS.REJECTED,
    PRN_STATUS.AWAITING_CANCELLATION
  ],
  [PRN_STATUS.ACCEPTED]: [PRN_STATUS.AWAITING_CANCELLATION],
  [PRN_STATUS.REJECTED]: [],
  [PRN_STATUS.AWAITING_CANCELLATION]: [PRN_STATUS.CANCELLED],
  [PRN_STATUS.CANCELLED]: [],
  [PRN_STATUS.DELETED]: []
}

class InvalidStatusTransitionError extends Error {
  constructor(fromStatus, toStatus) {
    super(`Cannot transition PRN from ${fromStatus} to ${toStatus}`)
    this.name = 'InvalidStatusTransitionError'
    this.fromStatus = fromStatus
    this.toStatus = toStatus
  }
}

/**
 * Validates a PRN status transition
 * @param {string|undefined} currentStatus - The current PRN status
 * @param {string} newStatus - The status to transition to
 * @returns {boolean} True if transition is valid
 * @throws {InvalidStatusTransitionError} If the transition is not allowed
 */
export const validateStatusTransition = (currentStatus, newStatus) => {
  if (!currentStatus) {
    if (newStatus !== PRN_STATUS.DRAFT) {
      throw new InvalidStatusTransitionError(undefined, newStatus)
    }
    return true
  }

  const allowedTransitions = VALID_TRANSITIONS[currentStatus]
  const isValid = allowedTransitions
    ? allowedTransitions.includes(newStatus)
    : false

  if (!isValid) {
    throw new InvalidStatusTransitionError(currentStatus, newStatus)
  }

  return true
}

/**
 * @returns {string} The default status for a new PRN
 */
export const getDefaultStatus = () => PRN_STATUS.DRAFT
