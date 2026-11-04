import { calendarDate, toCalendarDate } from '#common/helpers/date-formatter.js'
import { utcYearOf } from '#common/helpers/dates/year.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'

/** @import {Brand} from '#common/helpers/brand.js' */
/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */
/** @import {Year} from '#common/helpers/dates/year.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {AccreditationStatus} from '#domain/organisations/model.js' */
/** @import {AccreditedPeriod} from '#waste-balances/domain/classification-context.js' */
/** @import {StatusTimeline} from '#organisation-read-model/domain/model.js' */

/**
 * @typedef {{ updatedAt: number, status: AccreditationStatus }} StatusHistoryDateTime
 */

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
 * @param {Pick<Accreditation, 'validFrom' | 'validTo'>} accreditation
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
 * @param { AccreditedPeriod | null | undefined } accreditation
 * @returns { boolean } True if accredited at date
 */
export function isAccreditedAtDates(dates, accreditation) {
  if (!accreditation) {
    return true
  }
  const { window, timeline } = accreditation
  if (window === null) {
    return false
  }
  // Sorted once for every date, not once per date.
  const statusHistory = timelineDateTimes(timeline)
  return dates.every(
    (date) =>
      isWithinAccreditationDateRange(date, window) &&
      !isSuspendedOrCancelled(statusHeldAt(date, statusHistory))
  )
}

/**
 * @param {AccreditationStatus | undefined} status
 * @returns {boolean}
 */
const isSuspendedOrCancelled = (status) =>
  status === ACCREDITATION_STATUS.SUSPENDED ||
  status === ACCREDITATION_STATUS.CANCELLED

/**
 * A status timeline as descending date-times, the shape `statusHeldAt` reads.
 * The sort is stable, so entries sharing an instant keep their recorded order.
 *
 * @param {StatusTimeline} timeline
 * @returns {StatusHistoryDateTime[]}
 */
function timelineDateTimes(timeline) {
  return timeline
    .map(({ status, at }) => ({
      updatedAt: new Date(at).getTime(),
      status: /** @type {AccreditationStatus} */ (status)
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
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
 * The status an accreditation held on a date, read from its history: each
 * entry holds from its `updatedAt` until the next. Before the first entry
 * there is none, so a date there is left to the validity window alone.
 *
 * @param {string|Date} date
 * @param {StatusHistoryDateTime[]} statusHistory - descending
 * @returns {AccreditationStatus | undefined}
 */
export function statusHeldAt(date, statusHistory) {
  return statusHistory.find(
    (entry) => entry.updatedAt <= new Date(date).getTime()
  )?.status
}

/**
 * `statusHeldAt` over a status timeline rather than legacy history entries.
 *
 * @param {string|Date} date
 * @param {StatusTimeline} timeline
 * @returns {AccreditationStatus | undefined}
 */
export function statusHeldAtOnTimeline(date, timeline) {
  return statusHeldAt(date, timelineDateTimes(timeline))
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
