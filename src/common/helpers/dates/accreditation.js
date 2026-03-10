/**
 * Checks if a date is within the accreditation date range.
 *
 * @param {Date} date - The date to check
 * @param {Object|null} accreditation - Accreditation object with validFrom and validTo, or null to skip check
 * @returns {boolean} True if date is within range (inclusive), or true when no accreditation provided
 */
export const isWithinAccreditationDateRange = (date, accreditation) => {
  if (!accreditation) {
    return true
  }

  const compareDate = new Date(date)
  const validFrom = new Date(accreditation.validFrom)
  const validTo = new Date(accreditation.validTo)

  return compareDate >= validFrom && compareDate <= validTo
}
