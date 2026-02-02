/**
 * PRN status values
 * @see {@link /docs/architecture/decisions/0024-create-prn-api-strategy.md}
 */
export const PRN_STATUS = Object.freeze({
  DRAFT: 'draft',
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
