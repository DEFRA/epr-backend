import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'

/** @import {Accreditation, StatusHistoryEntry} from '#domain/organisations/accreditation.js' */
/** @import {AccreditationStatus} from '#domain/organisations/model.js' */

/**
 * @typedef {{ updatedAt: number, status: AccreditationStatus }} StatusHistoryDateTime
 */

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
  const { validFrom, validTo } = accreditation
  if (!validFrom || !validTo) {
    return false
  }
  const sortedHistory = getStatusHistoryDateTimes(accreditation.statusHistory)
  return dates.every(
    (date) =>
      isWithinAccreditationDateRange(date, { validFrom, validTo }) &&
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
 * @param { Date|string } date - The date to check
 * @param { {validFrom: string, validTo: string} } accreditation - Accreditation with date range
 * @returns { boolean } True if date is within range (inclusive)
 */
export function isWithinAccreditationDateRange(date, accreditation) {
  const compareDate = new Date(date)
  const validFrom = new Date(accreditation.validFrom)
  const validTo = new Date(accreditation.validTo)

  return compareDate >= validFrom && compareDate <= validTo
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
