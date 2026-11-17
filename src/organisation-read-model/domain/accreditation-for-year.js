/** @import { Year } from '#common/helpers/dates/year.js' */

/**
 * The registration's accreditation for a year, if it holds one.
 *
 * @template A
 * @param {{ accreditations: Record<string, A> }} registration
 * @param {Year} year
 * @returns {A | undefined}
 */
export const accreditationForYear = ({ accreditations }, year) =>
  Object.hasOwn(accreditations, year) ? accreditations[year] : undefined
