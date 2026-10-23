import { LOGGING_EVENT_ACTIONS } from '#common/enums/index.js'
import { conflict } from '#common/helpers/logging/cdp-boom.js'
import { ADMIN_CANCELLABLE_PREVIOUS_STATUSES } from './cancellation.js'
import { PRN_STATUS } from './model.js'
import {
  RelevantYearWindowExpiredError,
  isBeforeEndOfRelevantYear,
  relevantYearWindowRefusal
} from './relevant-year.js'

/** @import { PrnStatus } from './model.js' */

/**
 * Once an accreditation's relevant year has closed, at the end of 31 January
 * after it, no evidence can be raised against it and issued evidence can no
 * longer be cancelled by an admin. Discarding or deleting a note never issued
 * stays open, as does anything the producer or a signatory does.
 *
 * The one statement of which PRN/PERN writes close with the year. Creating a
 * note is the write to `draft`, which has no status before it.
 */

/** @type {ReadonlyArray<{ from?: PrnStatus, to: PrnStatus }>} */
const CLOSES_WITH_THE_YEAR = [
  { to: PRN_STATUS.DRAFT },
  { from: PRN_STATUS.DRAFT, to: PRN_STATUS.AWAITING_AUTHORISATION },
  {
    from: PRN_STATUS.AWAITING_AUTHORISATION,
    to: PRN_STATUS.AWAITING_ACCEPTANCE
  },
  ...[...ADMIN_CANCELLABLE_PREVIOUS_STATUSES].map((from) => ({
    from,
    to: PRN_STATUS.CANCELLED
  }))
]

/**
 * @param {PrnStatus | undefined} fromStatus
 * @param {PrnStatus} newStatus
 */
const closesWithTheYear = (fromStatus, newStatus) =>
  CLOSES_WITH_THE_YEAR.some(
    ({ from, to }) => to === newStatus && (!from || from === fromStatus)
  )

/**
 * The refusal of a write once the accreditation's year has closed, or
 * `undefined` when the write is allowed.
 *
 * @param {{
 *   accreditationYear: number,
 *   fromStatus?: PrnStatus,
 *   newStatus: PrnStatus,
 *   now: Date
 * }} write
 */
export const closedYearRefusal = ({
  accreditationYear,
  fromStatus,
  newStatus,
  now
}) =>
  closesWithTheYear(fromStatus, newStatus)
    ? relevantYearWindowRefusal(accreditationYear, now)
    : undefined

/**
 * Whether notes can still be raised and issued for the year.
 * @param {number} accreditationYear
 * @param {Date} now
 */
export const isRelevantYearOpen = (accreditationYear, now) =>
  isBeforeEndOfRelevantYear(accreditationYear, now)

/**
 * Whether an admin could cancel a note in this status right now.
 * @param {PrnStatus} status
 * @param {number} accreditationYear
 * @param {Date} now
 */
export const isRegulatorCancellable = (status, accreditationYear, now) =>
  ADMIN_CANCELLABLE_PREVIOUS_STATUSES.has(status) &&
  isRelevantYearOpen(accreditationYear, now)

/**
 * Response-body `code` of the 409 refusing a write once the year has closed,
 * so the frontend can tell it from other conflicts.
 */
export const RELEVANT_YEAR_CLOSED_CODE = 'RELEVANT_YEAR_CLOSED'

/**
 * @param {RelevantYearWindowExpiredError} refusal
 * @param {string} [reference] - what was refused, for the log line
 */
export const closedYearConflict = (
  refusal,
  reference = `relevantYear=${refusal.relevantYear}`
) =>
  conflict(refusal.message, RELEVANT_YEAR_CLOSED_CODE, {
    event: {
      action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE,
      reason: `${reference} rejected=${RELEVANT_YEAR_CLOSED_CODE}`
    },
    payload: { code: RELEVANT_YEAR_CLOSED_CODE }
  })

/**
 * The 409 for a write refused because its year has closed, or `undefined` for
 * any other error.
 * @param {unknown} error
 * @param {string} [reference] - what was refused, for the log line
 */
export const closedYearConflictFor = (error, reference) =>
  error instanceof RelevantYearWindowExpiredError
    ? closedYearConflict(error, reference)
    : undefined
