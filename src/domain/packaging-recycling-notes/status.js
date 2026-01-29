/**
 * PRN status values
 * @see /docs/architecture/decisions/0024-create-prn-api-strategy.md
 */
export const PRN_STATUS = Object.freeze({
  AWAITING_AUTHORISATION: 'awaiting_authorisation',
  AWAITING_ACCEPTANCE: 'awaiting_acceptance',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  AWAITING_CANCELLATION: 'awaiting_cancellation'
})

/**
 * @typedef {typeof PRN_STATUS[keyof typeof PRN_STATUS]} PrnStatus
 */
