import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  assertBeforeEndOfRelevantYear,
  isBeforeEndOfRelevantYear
} from '#packaging-recycling-notes/domain/relevant-year.js'

/**
 * Prior statuses a PRN/PERN can be admin-cancelled from, and so must respect
 * the relevant-year deadline below. `accepted` since PAE-1823; `awaiting_acceptance`
 * added for PAE-1859 (cancelling a note stuck awaiting the recipient's response).
 *
 * The single source of truth for admin-cancellable statuses — also imported by
 * `routes/admin-cancel.js` for its 409 guard, so the deadline check here and
 * the route's cancellability check can never drift apart.
 *
 * @type {Set<import('#packaging-recycling-notes/domain/model.js').PrnStatus>}
 */
export const ADMIN_CANCELLABLE_PREVIOUS_STATUSES = new Set([
  PRN_STATUS.ACCEPTED,
  PRN_STATUS.AWAITING_ACCEPTANCE
])

/**
 * A PRN/PERN issued under an accreditation for relevant year Y must not be
 * cancelled after 31 January of the following year (PAE-1823, widened to
 * `awaiting_acceptance` by PAE-1859). Keyed on the transition itself, not the
 * actor, so callers can run this unconditionally on any status change.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} previousStatus
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} newStatus
 * @param {number} accreditationYear
 * @param {Date} now
 * @throws {import('#packaging-recycling-notes/domain/relevant-year.js').RelevantYearWindowExpiredError} when the deadline has passed
 */
export function assertCancellationAllowed(
  previousStatus,
  newStatus,
  accreditationYear,
  now
) {
  const isAdminCancellation =
    ADMIN_CANCELLABLE_PREVIOUS_STATUSES.has(previousStatus) &&
    newStatus === PRN_STATUS.CANCELLED

  if (isAdminCancellation) {
    assertBeforeEndOfRelevantYear(accreditationYear, now)
  }
}

/**
 * Whether an admin/regulator could cancel this PRN/PERN right now: its current
 * status is one admin cancellation can start from, and its accreditation
 * year's cancellation window has not closed. The single rule both the admin
 * PRN list (`admin-prn-mapper.js`) and, transitively, the activity page's
 * Cancel link are driven from — kept here so it can never drift from
 * `ADMIN_CANCELLABLE_PREVIOUS_STATUSES` or the deadline check above.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} status
 * @param {number} accreditationYear
 * @param {Date} now
 * @returns {boolean}
 */
export function isRegulatorCancellable(status, accreditationYear, now) {
  return (
    ADMIN_CANCELLABLE_PREVIOUS_STATUSES.has(status) &&
    isBeforeEndOfRelevantYear(accreditationYear, now)
  )
}
