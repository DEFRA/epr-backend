import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

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

/**
 * Checks a list of dates against an accreditation date range.
 * Returns IGNORED if any truthy date falls outside the range, null otherwise.
 *
 * @param {Array<string|Date|null|undefined>} dates - Dates to check
 * @param {Object} accreditation - Accreditation object with validFrom and validTo
 * @returns {import('#domain/summary-logs/table-schemas/validation-pipeline.js').RowOutcome|null}
 */
export const getDateRangeStatus = (dates, accreditation) => {
  for (const date of dates) {
    if (date && !isWithinAccreditationDateRange(date, accreditation)) {
      return ROW_OUTCOME.IGNORED
    }
  }
  return null
}
