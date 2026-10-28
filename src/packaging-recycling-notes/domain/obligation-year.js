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
 * Returns the obligation year to apply during acceptance. An omitted value and
 * any value supplied for a non-December PRN leave the stored value unchanged.
 * December PRNs may be accepted against their accreditation year or its
 * successor only.
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

  const { accreditationYear } = prn.accreditation
  const followingYear = nextYear(accreditationYear)
  if (providedObligationYear === accreditationYear) {
    return accreditationYear
  }
  if (providedObligationYear === followingYear) {
    return followingYear
  }
  throw new InvalidObligationYearError(
    accreditationYear,
    providedObligationYear
  )
}
