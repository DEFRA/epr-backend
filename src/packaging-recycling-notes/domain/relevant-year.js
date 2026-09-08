/**
 * "Relevant year" is the Producer Responsibility Obligations (Packaging and
 * Packaging Waste) Regulations 2024's term for the annual period a PRN/PERN,
 * accreditation or compliance obligation relates to (reg 41(2)): several
 * rules key off "31 January in the year immediately following the relevant
 * year" — the PRN cancellation deadline (PAE-1823) is one instance, not the
 * only one, so this module holds the general year-boundary arithmetic rather
 * than anything cancellation-specific.
 *
 * Evaluated in UTC. There is no date library in this codebase, and every
 * existing date helper (`#common/helpers/date-formatter.js`) is UTC-pinned.
 * 31 January is in GMT every year (BST does not start until late March), so
 * UTC and Europe/London name the same instant for this specific boundary.
 */

/**
 * Thrown when an instant falls after the end of a relevant year's window.
 */
export class RelevantYearWindowExpiredError extends Error {
  /**
   * @param {number} relevantYear
   */
  constructor(relevantYear) {
    const deadlineYear = relevantYear + 1
    super(
      `The deadline for a ${relevantYear} relevant year was 31 January ${deadlineYear}.`
    )
    this.relevantYear = relevantYear
  }
}

// Month index 0 = January.
const JANUARY = 0
const LAST_DAY_OF_JANUARY = 31
const END_OF_DAY_HOURS = 23
const END_OF_DAY_MINUTES = 59
const END_OF_DAY_SECONDS = 59
const END_OF_DAY_MILLISECONDS = 999

/**
 * The last instant (UTC) of 31 January in the year immediately following
 * `relevantYear` — inclusive.
 *
 * @param {number} relevantYear
 * @returns {Date}
 */
function endOfRelevantYear(relevantYear) {
  if (!Number.isFinite(relevantYear)) {
    throw new TypeError(
      `Cannot compute the end of a relevant year: relevantYear must be a finite number, got ${relevantYear}`
    )
  }
  return new Date(
    Date.UTC(
      relevantYear + 1,
      JANUARY,
      LAST_DAY_OF_JANUARY,
      END_OF_DAY_HOURS,
      END_OF_DAY_MINUTES,
      END_OF_DAY_SECONDS,
      END_OF_DAY_MILLISECONDS
    )
  )
}

/**
 * Whether `now` falls on or before the end of `relevantYear` (31 January of
 * the following year, inclusive).
 *
 * @param {number} relevantYear
 * @param {Date} now
 * @returns {boolean}
 */
export function isBeforeEndOfRelevantYear(relevantYear, now) {
  return now.getTime() <= endOfRelevantYear(relevantYear).getTime()
}

/**
 * The refusal when `now` falls after the end of `relevantYear`, or `undefined`
 * when it is still open. Reads the window through the predicate above so the
 * deadline is stated once.
 *
 * @param {number} relevantYear
 * @param {Date} now
 * @returns {RelevantYearWindowExpiredError | undefined}
 */
export function relevantYearWindowRefusal(relevantYear, now) {
  return isBeforeEndOfRelevantYear(relevantYear, now)
    ? undefined
    : new RelevantYearWindowExpiredError(relevantYear)
}

/**
 * The relevant year an accreditation's `validFrom` names. Approved
 * accreditations always carry `validFrom`; a missing value here means the
 * caller reached this on a path that should never have — every relevant-year
 * consumer only ever serves approved accreditations.
 *
 * @param {{ id: string; validFrom?: string }} accreditation
 * @returns {number}
 * @throws {Error} if validFrom is missing
 */
export function deriveAccreditationYear(accreditation) {
  if (!accreditation.validFrom) {
    throw new Error(
      `Accreditation ${accreditation.id} is missing validFrom — cannot derive accreditation year`
    )
  }
  return new Date(accreditation.validFrom).getFullYear()
}
