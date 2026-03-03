/**
 * Checks if a date is within the accreditation date range.
 *
 * @param {string|Date} date - The date to check
 * @param {Object} accreditation - Accreditation object with validFrom and validTo
 * @returns {boolean} True if date is within range (inclusive)
 */
export const isWithinAccreditationDateRange = (date, accreditation) => {
  const compareDate = new Date(date).getTime()
  const validFrom = new Date(accreditation.validFrom).getTime()
  const validTo = new Date(accreditation.validTo).getTime()

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
  if (!statusHistory) {
    return false
  }

  const compareDate = new Date(date).getTime()

  const sorted = [...statusHistory].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  const effective = sorted.find(
    (entry) => new Date(entry.updatedAt).getTime() <= compareDate
  )

  return effective?.status === 'suspended'
}
