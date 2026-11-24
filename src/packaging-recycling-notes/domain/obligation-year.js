import { nextYear } from '#common/helpers/dates/year.js'

/** @import { Year } from '#common/helpers/dates/year.js' */

export class InvalidObligationYearError extends Error {
  /**
   * @param {Year} accreditationYear
   * @param {number} obligationYear
   */
  constructor(accreditationYear, obligationYear) {
    super(
      `obligationYear must be either accreditation year ${accreditationYear} or ${accreditationYear + 1} for a December waste PRN; received ${obligationYear}`
    )
    this.name = 'InvalidObligationYearError'
  }
}

/**
 * The obligation years a PRN can be accepted towards: its accreditation year,
 * and for December waste the year after too.
 *
 * @param {{ isDecemberWaste: boolean, accreditation: { accreditationYear: Year } }} prn
 * @returns {Year[]}
 */
export const acceptableObligationYears = ({
  isDecemberWaste,
  accreditation: { accreditationYear }
}) =>
  isDecemberWaste
    ? [accreditationYear, nextYear(accreditationYear)]
    : [accreditationYear]

/**
 * Returns the obligation year to apply during acceptance. An omitted value and
 * any value supplied for a non-December PRN leave the stored value unchanged.
 * December PRNs may be accepted against one of their acceptable obligation
 * years only.
 *
 * @param {{ isDecemberWaste: boolean, accreditation: { accreditationYear: Year } }} prn
 * @param {number} [providedObligationYear]
 * @returns {Year | undefined}
 */
export const selectObligationYearForAcceptance = (
  prn,
  providedObligationYear
) => {
  if (providedObligationYear === undefined || !prn.isDecemberWaste) {
    return undefined
  }

  const allowedObligationYear = acceptableObligationYears(prn).find(
    (year) => year === providedObligationYear
  )

  if (!allowedObligationYear) {
    throw new InvalidObligationYearError(
      prn.accreditation.accreditationYear,
      providedObligationYear
    )
  }

  return allowedObligationYear
}
