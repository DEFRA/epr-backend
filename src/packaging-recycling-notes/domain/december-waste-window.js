import { formatLocalDateTime } from '#common/helpers/dates/local-datetime.js'
import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'
import { deriveAccreditationYear } from '#common/helpers/dates/accreditation.js'
import { conflict } from '#common/helpers/logging/cdp-boom.js'
import { LOGGING_EVENT_ACTIONS } from '#common/enums/index.js'
import {
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import { isBeforeEndOfRelevantYear } from '#packaging-recycling-notes/domain/relevant-year.js'

/**
 * The December Waste declaration window (PAE-1913): a reprocessor on output
 * may mark a PRN as December Waste from `windowStart` of the accreditation's
 * relevant year through 31 January the year after - the same relevant-year
 * deadline `relevant-year.js` already states for cancellation, so the upper
 * bound is composed from there rather than restated. Only the start is
 * configurable (a lower-environment override); the end is never anything
 * other than the relevant-year boundary.
 *
 * `windowStart` is resolved against `now` in UK local time (Europe/London),
 * because unlike `relevant-year.js`'s fixed 31 January boundary (always GMT
 * by coincidence) a configured start can fall in any month, including one
 * inside British Summer Time.
 */

/**
 * Whether `now` falls within the December Waste declaration window for an
 * accreditation of `relevantYear`.
 *
 * @param {number} relevantYear
 * @param {Date} now
 * @param {{ windowStart: string }} config - `windowStart` as `MM-DDTHH:mm`
 * @returns {boolean}
 */
export function isWithinDecemberWasteWindow(
  relevantYear,
  now,
  { windowStart }
) {
  const stamp = formatLocalDateTime(now, UK_TIME_ZONE)
  const start = `${relevantYear}-${windowStart}`

  // Deliberate string comparison, not numeric: both sides are zero-padded
  // `YYYY-MM-DDTHH:mm` and sort chronologically as strings - that is the
  // whole point of the format, see formatLocalDateTime.
  return stamp >= start && isBeforeEndOfRelevantYear(relevantYear, now)
}

/**
 * Whether an accreditation must declare its December Waste manually, rather than
 * have it derived from a December balance: true only for a reprocessor on
 * output. An output accreditation accrues no December balance (see
 * `december-credit-total.js`, which zeroes `REPROCESSOR_OUTPUT` rows), so it has
 * no tonnage to derive the marker from and the operator self-declares it for
 * disclosure. Input reprocessors and exporters do accrue a December balance
 * (PAE-1922), so they stay false here and their pool routing is decided by
 * `resolveUseDecemberBalance` in `use-december-balance.js` instead.
 *
 * This is now only the disclosure signal (does the operator declare manually),
 * not a proxy for "has no December balance": that distinction moved to
 * `accruesDecember`. The `december-eligibility` route consumes it to decide
 * whether to prompt for a manual declaration.
 *
 * @param {{ wasteProcessingType: string, reprocessingType?: string }} accreditation
 * @returns {boolean}
 */
export function declaresDecemberWasteManually(accreditation) {
  if (accreditation.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return false
  }

  return accreditation.reprocessingType === REPROCESSING_TYPE.OUTPUT
}

export const DECEMBER_WASTE_NOT_DECLARABLE_CODE =
  'DECEMBER_WASTE_NOT_DECLARABLE'

/**
 * Asserts the December Waste declaration window is open at PRN creation. No-ops
 * unless `isDecemberWaste` is actually set, so the common path is untouched.
 *
 * The window gates every declarer alike (PAE-1922): the disclosure duty is
 * uniform across accreditation types (paras 24(4)/27(3)), so an exporter or
 * input reprocessor may declare December inside the window just as an output
 * reprocessor may. Which accreditation accrues a December balance governs pool
 * routing (`useDecemberBalance`, see `use-december-balance.js`), not whether
 * the declaration is permitted - so the type predicate no longer gates here.
 *
 * @param {Object} params
 * @param {{ id: string, wasteProcessingType: string, reprocessingType?: string, validFrom?: string }} params.accreditation
 * @param {boolean} params.isDecemberWaste
 * @param {Date} params.now
 * @param {{ windowStart: string }} params.config
 */
export function assertDecemberWasteDeclarable({
  accreditation,
  isDecemberWaste,
  now,
  config
}) {
  if (!isDecemberWaste) {
    return
  }

  if (
    isWithinDecemberWasteWindow(
      deriveAccreditationYear(accreditation),
      now,
      config
    )
  ) {
    return
  }

  throw conflict(
    'December Waste can only be declared within the declaration window',
    DECEMBER_WASTE_NOT_DECLARABLE_CODE,
    {
      event: {
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE,
        reason: `accreditationId=${accreditation.id} rejected=${DECEMBER_WASTE_NOT_DECLARABLE_CODE}`
      },
      payload: { code: DECEMBER_WASTE_NOT_DECLARABLE_CODE }
    }
  )
}
