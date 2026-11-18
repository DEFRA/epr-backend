import { utcYearOf } from '#common/helpers/dates/year.js'

/** @import { Year } from '#common/helpers/dates/year.js' */

/**
 * The relevant year an accreditation's `validFrom` names. Approved
 * accreditations always carry `validFrom`; a missing value here means the
 * caller reached this on a path that should never have — every relevant-year
 * consumer only ever serves approved accreditations.
 *
 * @param {{ id: string; validFrom?: string }} accreditation
 * @returns {Year}
 * @throws {Error} if validFrom is missing
 */
export function deriveAccreditationYear(accreditation) {
  if (!accreditation.validFrom) {
    throw new Error(
      `Accreditation ${accreditation.id} is missing validFrom — cannot derive accreditation year`
    )
  }
  return utcYearOf(accreditation.validFrom)
}
