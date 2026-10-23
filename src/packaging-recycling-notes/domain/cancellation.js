import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

/** @import { PrnStatus } from '#packaging-recycling-notes/domain/model.js' */

/**
 * Prior statuses a PRN/PERN can be admin-cancelled from: `accepted`, and
 * `awaiting_acceptance` for a note stuck awaiting the recipient's response.
 *
 * The single source of truth for admin-cancellable statuses, so the closed-year
 * rule and a caller's own cancellability guard can never drift apart.
 *
 * @type {Set<PrnStatus>}
 */
export const ADMIN_CANCELLABLE_PREVIOUS_STATUSES = new Set([
  PRN_STATUS.ACCEPTED,
  PRN_STATUS.AWAITING_ACCEPTANCE
])
