import { conflict } from '#common/helpers/logging/cdp-boom.js'
import { LOGGING_EVENT_ACTIONS } from '#common/enums/index.js'
import { deriveAccreditationYear } from '#common/helpers/dates/accreditation.js'
import { PRN_STATUS } from './model.js'
import { relevantYearWindowRefusal } from './relevant-year.js'

/**
 * The reg 92(1)(c)/(2)(c) issuance window (SI 2024/1332): a PRN/PERN may only
 * be issued in the year the packaging waste is received or by 31 January of
 * the following year. The statute names only the act of issuing; the lifecycle
 * around it is ours, so the window gates the operator actions that progress a
 * note towards issuance — creating a draft (see `assertIssuanceWindowOpen`),
 * submitting it for authorisation, and the issue itself — and deliberately
 * leaves undoing (discard, delete, cancel) and the producer's side (accept,
 * reject) open. Deleting after the window must stay possible precisely so a
 * stranded submission can release the balance it ringfenced.
 *
 * The boundary is the same "31 January after the relevant year" that
 * `relevant-year.js` holds for cancellation, so it is composed from there
 * rather than restated.
 */

export const ISSUANCE_WINDOW_CLOSED_CODE = 'ISSUANCE_WINDOW_CLOSED'

/**
 * The `from -> to` pairs that progress a note towards issuance, as
 * `"from>to"` keys. Keyed on the pair rather than the target so a future
 * transition reusing a target status from elsewhere is not silently gated.
 *
 * @type {Set<string>}
 */
const PROGRESS_TRANSITION_KEYS = new Set([
  `${PRN_STATUS.DRAFT}>${PRN_STATUS.AWAITING_AUTHORISATION}`,
  `${PRN_STATUS.AWAITING_AUTHORISATION}>${PRN_STATUS.AWAITING_ACCEPTANCE}`
])

/**
 * The refusal when a transition progressing a note towards issuance falls
 * after its accreditation's issuance window, or `undefined` when the
 * transition is not gated or the window is still open.
 *
 * @param {import('./model.js').PrnStatus} previousStatus
 * @param {import('./model.js').PrnStatus} newStatus
 * @param {number} accreditationYear
 * @param {Date} now
 * @returns {import('./relevant-year.js').RelevantYearWindowExpiredError | undefined}
 */
export function issuanceWindowRefusal(
  previousStatus,
  newStatus,
  accreditationYear,
  now
) {
  return PROGRESS_TRANSITION_KEYS.has(`${previousStatus}>${newStatus}`)
    ? relevantYearWindowRefusal(accreditationYear, now)
    : undefined
}

/**
 * The 409 a closed issuance window surfaces as, wherever it is hit: the
 * operator-facing copy and the machine-readable `code` the frontend
 * discriminates on, stated once so the create route and the status
 * transitions cannot drift apart.
 *
 * @param {string} accreditationId
 */
export function issuanceWindowClosedError(accreditationId) {
  return conflict(
    'The issuance window for this accreditation year has closed',
    ISSUANCE_WINDOW_CLOSED_CODE,
    {
      event: {
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE,
        reason: `accreditationId=${accreditationId} rejected=${ISSUANCE_WINDOW_CLOSED_CODE}`
      },
      payload: { code: ISSUANCE_WINDOW_CLOSED_CODE }
    }
  )
}

/**
 * Asserts the issuance window is open at PRN draft creation, whatever the
 * payload declares: after 31 January no note of any kind may be raised against
 * the prior year's accreditation.
 *
 * @param {Object} params
 * @param {{ id: string, validFrom?: string }} params.accreditation
 * @param {Date} params.now
 */
export function assertIssuanceWindowOpen({ accreditation, now }) {
  const refusal = relevantYearWindowRefusal(
    deriveAccreditationYear(accreditation),
    now
  )
  if (!refusal) {
    return
  }

  throw issuanceWindowClosedError(accreditation.id)
}
