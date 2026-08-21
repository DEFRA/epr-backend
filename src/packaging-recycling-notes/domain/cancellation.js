import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { assertBeforeEndOfRelevantYear } from '#packaging-recycling-notes/domain/relevant-year.js'

/**
 * A PRN/PERN issued under an accreditation for relevant year Y must not be
 * cancelled after 31 January of the following year (PAE-1823). Keyed on the
 * transition itself, not the actor, so callers can run this unconditionally
 * on any status change.
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
  const isAcceptedToCancelled =
    previousStatus === PRN_STATUS.ACCEPTED && newStatus === PRN_STATUS.CANCELLED

  if (isAcceptedToCancelled) {
    assertBeforeEndOfRelevantYear(accreditationYear, now)
  }
}
