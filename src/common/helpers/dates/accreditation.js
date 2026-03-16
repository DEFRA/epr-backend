/** @import {Accreditation} from '#repositories/organisations/port.js' */
/** @import {StatusHistoryEntry} from '#repositories/organisations/port.js' */

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
  if (!accreditation.statusHistory) {
    return false
  }
  const sortedHistory = getStatusHistoryDateTimes(accreditation.statusHistory)
  return dates.every(
    (date) =>
      isWithinAccreditationDateRange(date, accreditation) &&
      isAccreditationApprovedAtDate(date, sortedHistory)
  )
}

/**
 * Convert dates to numbers and sort descending
 * @param { StatusHistoryEntry[] } [statusHistory] - Accreditation status history
 * @returns {{ updatedAt: number; status: string; }[]} Sorted list
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
 * @param { Accreditation } accreditation - Accreditation object with validFrom and validTo
 * @returns { boolean } True if date is within range (inclusive)
 */
export function isWithinAccreditationDateRange(date, accreditation) {
  const compareDate = new Date(date)
  const validFrom = new Date(accreditation.validFrom)
  const validTo = new Date(accreditation.validTo)

  return compareDate >= validFrom && compareDate <= validTo
}

/**
 * Checks if an accreditation was approved at a given date by examining the
 * status history. Finds the most recent status change on or before the date
 * and checks if it was 'approved'.
 *
 * @param {string|Date} date - The date to check
 * @param {{ updatedAt: number; status: string; }[]} [statusHistory] - Accreditation status history in descending date order
 * @returns {boolean} True if the accreditation was approved at the given date
 */
export function isAccreditationApprovedAtDate(date, statusHistory) {
  return (
    statusHistory.find((entry) => entry.updatedAt <= new Date(date).getTime())
      ?.status === 'approved'
  )
}
