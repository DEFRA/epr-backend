import { decemberKeyForYearOf } from '#common/helpers/dates/year-month.js'

/**
 * @typedef {import('#domain/organisations/accreditation.js').Accreditation} Accreditation
 */

/**
 * The `YYYY-12` month key of the accreditation year — the December that
 * accreditation's tonnage accrues against — taken from the year of `validFrom`.
 * Null when `validFrom` is absent or too short to carry a year, so a caller
 * that cannot place a December has nothing to compare rather than guessing one.
 *
 * Delegates to the shared `decemberKeyForYearOf` so the diagnostic and the waste
 * balance accrual place "which December" by one definition.
 *
 * @param {Pick<Accreditation, 'validFrom'>} accreditation
 * @returns {string | null}
 */
export const accreditationDecemberKey = ({ validFrom }) =>
  decemberKeyForYearOf(validFrom)
