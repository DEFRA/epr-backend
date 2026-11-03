/** @import { AccreditationNumber } from '#domain/organisations/numbers.js' */
/** @import { Registration } from './model.js' */

/**
 * The registration's accreditation with the given number, and the year it is
 * keyed by, or null when it has none.
 *
 * @param {Registration} registration
 * @param {AccreditationNumber} accreditationNumber
 * @returns {{
 *   year: string
 *   accreditation: Registration['accreditations'][string]
 * } | null}
 */
export const findAccreditationByNumber = (
  registration,
  accreditationNumber
) => {
  const match = Object.entries(registration.accreditations).find(
    ([, accreditation]) =>
      accreditation.accreditationNumber === accreditationNumber
  )
  return match ? { year: match[0], accreditation: match[1] } : null
}
