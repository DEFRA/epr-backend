import { ukCalendarDate } from '#common/helpers/dates/uk-calendar-date.js'
import { conflict } from '#common/helpers/logging/cdp-boom.js'
import { LOGGING_EVENT_ACTIONS } from '#common/enums/index.js'
import { isDecemberWasteOpen } from '#domain/year-activities/rules.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { AccreditationNumber } from '#domain/organisations/numbers.js' */

/**
 * Whether `now` falls within the December Waste declaration window (PAE-1913)
 * for an accreditation of `relevantYear`. The window is stated in
 * `#domain/year-activities/rules.js`.
 *
 * @param {Year} relevantYear
 * @param {Date} now
 * @returns {boolean}
 */
export const isWithinDecemberWasteWindow = (relevantYear, now) =>
  isDecemberWasteOpen(relevantYear, ukCalendarDate(now))

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
 * routing (`pool`, see `resolve-pool.js`), not whether the declaration is
 * permitted - so the type predicate no longer gates here.
 *
 * @param {Object} params
 * @param {{ accreditationNumber: AccreditationNumber, accreditationYear: Year }} params.accreditation
 * @param {boolean} params.isDecemberWaste
 * @param {Date} params.now
 */
export function assertDecemberWasteDeclarable({
  accreditation,
  isDecemberWaste,
  now
}) {
  if (!isDecemberWaste) {
    return
  }

  if (isWithinDecemberWasteWindow(accreditation.accreditationYear, now)) {
    return
  }

  throw conflict(
    'December Waste can only be declared within the declaration window',
    DECEMBER_WASTE_NOT_DECLARABLE_CODE,
    {
      event: {
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE,
        reason: `accreditationNumber=${accreditation.accreditationNumber} rejected=${DECEMBER_WASTE_NOT_DECLARABLE_CODE}`
      },
      payload: { code: DECEMBER_WASTE_NOT_DECLARABLE_CODE }
    }
  )
}
