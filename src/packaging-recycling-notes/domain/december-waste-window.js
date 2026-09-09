import { formatLocalDateTime } from '#common/helpers/dates/local-datetime.js'
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

const UK_TIME_ZONE = 'Europe/London'

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
 * Whether an accreditation's December Waste must be declared by the operator,
 * independent of the declaration window: true in June as well as December.
 *
 * Only a reprocessor on output today (PAE-1913), because it is the one type
 * with no automatic December balance to derive the tonnage from - see
 * `december-credit-total.js`, which zeroes `REPROCESSOR_OUTPUT` rows for the
 * same reason. Input reprocessors and exporters get a December balance in
 * later stories and so stay false here: they will have December waste too,
 * derived rather than declared. This is the single place that changes as
 * those stories land.
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
 * Asserts both halves of the December Waste rule together at PRN creation:
 * the accreditation must declare manually, and the declaration window must
 * be open. No-ops unless `isDecemberWaste` is actually set, so the common
 * path is untouched.
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

  const declarable =
    declaresDecemberWasteManually(accreditation) &&
    isWithinDecemberWasteWindow(
      deriveAccreditationYear(accreditation),
      now,
      config
    )

  if (declarable) {
    return
  }

  throw conflict(
    'December Waste cannot be declared on this accreditation',
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
