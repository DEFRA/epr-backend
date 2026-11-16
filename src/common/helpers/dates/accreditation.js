import { calendarDate, toCalendarDate } from '#common/helpers/date-formatter.js'
import { utcYearOf } from '#common/helpers/dates/year.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import { statusOn } from '#organisation-read-model/domain/model.js'

/** @import {Brand} from '#common/helpers/brand.js' */
/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */
/** @import {Year} from '#common/helpers/dates/year.js' */
/** @import {AccreditationValidity} from '#domain/organisations/accreditation.js' */

/**
 * The period an accreditation is valid for, both bounds present. Branded so it
 * can only arrive from `accreditationWindow`, which is the one place that
 * establishes both are there — an accreditation may carry neither, and the
 * range check has no sensible answer for half a window.
 *
 * @typedef {Brand<{
 *   validFrom: CalendarDate,
 *   validTo: CalendarDate
 * }, 'AccreditationWindow'>} AccreditationWindow
 */

/**
 * The window an accreditation is valid for, or null when it has never had one.
 *
 * Deliberately keyed on the dates being present rather than on current status.
 * An accreditation that was approved and later cancelled keeps the window it
 * held while it was live — the schema allows exactly that, requiring the dates
 * only for `approved`/`suspended` and permitting them otherwise — and loads
 * made before the cancellation are still accredited. Status decides whether a
 * *given date* falls inside the window (see `isAccreditedAtDates`),
 * not whether a window exists at all.
 *
 * @param {AccreditationValidity} accreditation
 * @returns {AccreditationWindow | null}
 */
export function accreditationWindow({ validFrom, validTo }) {
  return validFrom && validTo
    ? /** @type {AccreditationWindow} */ ({
        validFrom: calendarDate(validFrom),
        validTo: calendarDate(validTo)
      })
    : null
}

/** @type {ReadonlySet<string | undefined>} */
const EXCLUDED_STATUSES = new Set([
  ACCREDITATION_STATUS.SUSPENDED,
  ACCREDITATION_STATUS.CANCELLED
])

/**
 * Checks if all dates are accredited. The last status on a day holds for the
 * whole day.
 * @param { (Date|string)[] } dates - The date to check
 * @param { AccreditationValidity | null | undefined } accreditation
 * @returns { boolean } True if accredited at date
 */
export function isAccreditedAtDates(dates, accreditation) {
  if (!accreditation) {
    return true
  }
  const window = accreditationWindow(accreditation)
  if (window === null) {
    return false
  }
  return dates.every(
    (date) =>
      isWithinAccreditationDateRange(date, window) &&
      !EXCLUDED_STATUSES.has(
        statusOn(accreditation.timeline, toCalendarDate(date))
      )
  )
}

/**
 * Checks if a date is within the accreditation date range.
 *
 * Compared as calendar dates, not instants: the bounds are bare dates, so an
 * instant later in the day would otherwise sort after the bound it shares a
 * day with and drop the last day of the window.
 *
 * @param { Date|string } date - The date to check
 * @param { AccreditationWindow } window - The accreditation's validity window
 * @returns { boolean } True if date is within range (inclusive)
 */
export function isWithinAccreditationDateRange(date, window) {
  const day = toCalendarDate(date)

  return day >= window.validFrom && day <= window.validTo
}

/**
 * The relevant year an accreditation's `validFrom` names. Approved
 * accreditations always carry `validFrom`; a missing value here means the
 * caller reached this on a path that should never have — every relevant-year
 * consumer only ever serves approved accreditations.
 *
 * @param {{ id: string; validFrom?: string }} accreditation
 * @returns {Year}
 * @throws {Error} if validFrom is missing
 */
export function deriveAccreditationYear(accreditation) {
  if (!accreditation.validFrom) {
    throw new Error(
      `Accreditation ${accreditation.id} is missing validFrom — cannot derive accreditation year`
    )
  }
  return utcYearOf(accreditation.validFrom)
}
