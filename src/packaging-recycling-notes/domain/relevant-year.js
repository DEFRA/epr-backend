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
  // Month index 0 = January.
  return new Date(Date.UTC(relevantYear + 1, 0, 31, 23, 59, 59, 999))
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
 * Asserts `now` falls on or before the end of `relevantYear`.
 *
 * @param {number} relevantYear
 * @param {Date} now
 * @throws {RelevantYearWindowExpiredError} when the deadline has passed
 */
export function assertBeforeEndOfRelevantYear(relevantYear, now) {
  if (!isBeforeEndOfRelevantYear(relevantYear, now)) {
    throw new RelevantYearWindowExpiredError(relevantYear)
  }
}
