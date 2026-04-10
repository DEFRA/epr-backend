/**
 * @param {Date | null | undefined} validFrom
 * @param {string} dateOfExport - ISO date string (YYYY-MM-DD)
 * @returns {boolean}
 */
export function isOrsApprovedAtDate(validFrom, dateOfExport) {
  return validFrom != null && validFrom <= new Date(dateOfExport)
}
