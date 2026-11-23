import { nextYear } from '#common/helpers/dates/year.js'
import { ukCalendarDate } from '#common/helpers/dates/uk-calendar-date.js'
import { isPrnYearOpen } from '#domain/year-activities/rules.js'

/** @import { Year } from '#common/helpers/dates/year.js' */

/**
 * "Relevant year" is the Producer Responsibility Obligations (Packaging and
 * Packaging Waste) Regulations 2024's term for the annual period a PRN/PERN,
 * accreditation or compliance obligation relates to (reg 41(2)): several
 * rules key off "31 January in the year immediately following the relevant
 * year" — the PRN cancellation deadline (PAE-1823) is one instance, not the
 * only one, so this module holds the general year-boundary arithmetic rather
 * than anything cancellation-specific.
 *
 * The window itself is stated in `#domain/year-activities/rules.js`.
 */

/**
 * Thrown when an instant falls after the end of a relevant year's window.
 */
export class RelevantYearWindowExpiredError extends Error {
  /**
   * @param {Year} relevantYear
   */
  constructor(relevantYear) {
    const deadlineYear = nextYear(relevantYear)
    super(
      `The deadline for a ${relevantYear} relevant year was 31 January ${deadlineYear}.`
    )
    this.relevantYear = relevantYear
  }
}

/**
 * Whether `now` falls on or before the last UK calendar day PRNs and PERNs
 * are open for `relevantYear` (31 January of the following year).
 *
 * @param {Year} relevantYear
 * @param {Date} now
 * @returns {boolean}
 */
export function isBeforeEndOfRelevantYear(relevantYear, now) {
  if (!Number.isFinite(relevantYear)) {
    throw new TypeError(
      `Cannot compute the end of a relevant year: relevantYear must be a finite number, got ${relevantYear}`
    )
  }
  return isPrnYearOpen(relevantYear, ukCalendarDate(now))
}

/**
 * The refusal when `now` falls after the end of `relevantYear`, or `undefined`
 * when it is still open. Reads the window through the predicate above so the
 * deadline is stated once.
 *
 * @param {Year} relevantYear
 * @param {Date} now
 * @returns {RelevantYearWindowExpiredError | undefined}
 */
export function relevantYearWindowRefusal(relevantYear, now) {
  return isBeforeEndOfRelevantYear(relevantYear, now)
    ? undefined
    : new RelevantYearWindowExpiredError(relevantYear)
}
