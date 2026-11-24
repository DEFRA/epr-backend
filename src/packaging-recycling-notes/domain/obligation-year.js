import { nextYear } from '#common/helpers/dates/year.js'

/**
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { AccreditationSnapshot, PackagingRecyclingNote } from './model.js'
 */

/**
 * The parts of a PRN its obligation year rules read.
 * @typedef {Pick<PackagingRecyclingNote, 'isDecemberWaste'> & {
 *   accreditation: Pick<AccreditationSnapshot, 'accreditationYear'>
 * }} ObligationYearPrn
 */

export class InvalidObligationYearError extends Error {
  /**
   * @param {Year[]} allowedYears
   * @param {number} obligationYear
   */
  constructor(allowedYears, obligationYear) {
    super(
      `obligationYear must be either accreditation year ${allowedYears.join(' or ')} for a December waste PRN; received ${obligationYear}`
    )
    this.name = 'InvalidObligationYearError'
  }
}

/**
 * The obligation years a PRN can be accepted towards: its accreditation year,
 * and for December waste the year after too.
 *
 * @param {ObligationYearPrn} prn
 * @returns {Year[]}
 */
export const allowedObligationYears = ({
  isDecemberWaste,
  accreditation: { accreditationYear }
}) =>
  isDecemberWaste
    ? [accreditationYear, nextYear(accreditationYear)]
    : [accreditationYear]

/**
 * Returns the obligation year to apply during acceptance. An omitted value and
 * any value supplied for a non-December PRN leave the stored value unchanged.
 * December PRNs may be accepted against one of their allowed obligation
 * years only.
 *
 * @param {ObligationYearPrn} prn
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

  const allowedYears = allowedObligationYears(prn)
  const allowedObligationYear = allowedYears.find(
    (year) => year === providedObligationYear
  )

  if (!allowedObligationYear) {
    throw new InvalidObligationYearError(allowedYears, providedObligationYear)
  }

  return allowedObligationYear
}
