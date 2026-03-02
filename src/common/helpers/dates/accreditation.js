/**
 * Checks if a date is within the accreditation date range.
 *
 * @param {string|Date} date - The date to check
 * @param {Object} accreditation - Accreditation object with validFrom and validTo
 * @returns {boolean} True if date is within range (inclusive)
 */
export const isWithinAccreditationDateRange = (date, accreditation) => {
  const compareDate = new Date(date)
  const validFrom = new Date(accreditation.validFrom)
  const validTo = new Date(accreditation.validTo)

  return compareDate >= validFrom && compareDate <= validTo
}

/**
 * Checks if an accreditation was suspended at a given date by examining the
 * status history. Finds the most recent status change on or before the date
 * and checks if it was 'suspended'.
 *
 * @param {string|Date} date - The date to check
 * @param {Array<{status: string, updatedAt: string|Date}>} [statusHistory] - Accreditation status history
 * @returns {boolean} True if the accreditation was suspended at the given date
 */
export const isAccreditationSuspendedAtDate = (date, statusHistory) => {
  if (!statusHistory || statusHistory.length === 0) {
    return false
  }

  const compareDate = new Date(date)

  // Find the most recent status change on or before the given date
  let effectiveStatus = null
  let latestDate = null
  for (const entry of statusHistory) {
    const entryDate = new Date(entry.updatedAt)
    if (
      entryDate <= compareDate &&
      (latestDate === null || entryDate > latestDate)
    ) {
      latestDate = entryDate
      effectiveStatus = entry.status
    }
  }

  return effectiveStatus === 'suspended'
}
