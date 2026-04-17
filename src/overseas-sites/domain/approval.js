import { isNil } from '#common/helpers/is-nil.js'

/**
 * @param {Date | null | undefined} validFrom
 * @param {string} dateOfExport - ISO date string (YYYY-MM-DD)
 * @returns {boolean}
 */
export function isOrsApprovedAtDate(validFrom, dateOfExport) {
  return !isNil(validFrom) && validFrom <= new Date(dateOfExport)
}
