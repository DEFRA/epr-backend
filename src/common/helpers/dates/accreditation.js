import { calendarDate, toCalendarDate } from '#common/helpers/date-formatter.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'

/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */
/** @import {Accreditation, StatusHistoryEntry} from '#domain/organisations/accreditation.js' */
/** @import {AccreditationStatus} from '#domain/organisations/model.js' */

/**
 * @typedef {{ updatedAt: number, status: AccreditationStatus }} StatusHistoryDateTime
 */

/**
 * The period an accreditation is valid for, both bounds present. Branded so it
 * can only arrive from `accreditationWindow`, which is the one place that
 * establishes both are there — an accreditation may carry neither, and the
 * range check has no sensible answer for half a window.
 *
 * @typedef {{
 *   validFrom: CalendarDate,
 *   validTo: CalendarDate
 * } & { readonly __brand: 'AccreditationWindow' }} AccreditationWindow
 */

/**
 * The window an accreditation is valid for, or null when it has never had one.
 *
 * Deliberately keyed on the dates being present rather than on current status.
 * An accreditation that was approved and later cancelled keeps the window it
 * held while it was live — the schema allows exactly that, requiring the dates
 * only for `approved`/`suspended` and permitting them otherwise — and loads
 * made before the cancellation are still accredited. Status decides whether a
 * *given date* falls inside the window (see `isSuspendedOrCancelledAtDate`),
 * not whether a window exists at all.
 *
 * @param {Accreditation} accreditation
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

/**
 * Checks if all dates are accredited
 * @param { (Date|string)[] } dates - The date to check
 * @param { Accreditation | null | undefined } accreditation
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
  const sortedHistory = getStatusHistoryDateTimes(accreditation.statusHistory)
  return dates.every(
    (date) =>
      isWithinAccreditationDateRange(date, window) &&
      !isSuspendedOrCancelledAtDate(date, sortedHistory)
  )
}

/**
 * Convert dates to numbers and sort descending
 * @param { StatusHistoryEntry[] } statusHistory - Accreditation status history
 * @returns {StatusHistoryDateTime[]} Sorted list
 */
export function getStatusHistoryDateTimes(statusHistory) {
  const statusDates = statusHistory.map((s) => ({
    updatedAt: new Date(s.updatedAt).getTime(),
    status: s.status
  }))
  return statusDates.sort((a, b) => b.updatedAt - a.updatedAt)
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
 * Checks whether an accreditation was suspended or cancelled at a given date by
 * examining the status history. Finds the most recent status change on or before
 * the date and checks whether that status excludes the date from the
 * accreditation period.
 *
 * Suspension is temporary and cancellation is terminal, but both take effect
 * from their status-history `updatedAt`, so a date before the change is
 * unaffected and still counts. The validity window itself (validFrom/validTo)
 * is never altered by these transitions.
 *
 * @param {string|Date} date - The date to check
 * @param {StatusHistoryDateTime[]} statusHistory - Accreditation status history in descending date order
 * @returns {boolean} True if the accreditation was suspended or cancelled at the given date
 */
export function isSuspendedOrCancelledAtDate(date, statusHistory) {
  const status = statusHistory.find(
    (entry) => entry.updatedAt <= new Date(date).getTime()
  )?.status
  return (
    status === ACCREDITATION_STATUS.SUSPENDED ||
    status === ACCREDITATION_STATUS.CANCELLED
  )
}
