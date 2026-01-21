/**
 * Checks if a date is within the accreditation date range.
 *
 * @param {Date} date - The date to check
 * @param {Object} accreditation - Accreditation object with validFrom and validTo
 * @returns {boolean} True if date is within range (inclusive)
 */
export const isWithinAccreditationDateRange = (date, accreditation) => {
  const compareDate = new Date(date)
  const validFrom = new Date(accreditation.validFrom)
  const validTo = new Date(accreditation.validTo)

  return compareDate >= validFrom && compareDate <= validTo
}
