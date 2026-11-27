import {
  isBeforeCorrectionDeadline,
  lastCorrectionDay
} from '#domain/summary-logs/correction-deadline.js'

/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */
/** @import {FoundLinkedRow} from '../index.js' */

/**
 * Whether the previous year's row can still be corrected when this summary
 * log was uploaded.
 *
 * @param {FoundLinkedRow} linkedRow
 * @returns {boolean}
 */
export const isStillCorrectable = ({
  options: { createdAt, registeredOnly },
  previousYearLink
}) =>
  isBeforeCorrectionDeadline(
    previousYearLink.link.year,
    { registeredOnly },
    createdAt
  )

/**
 * @param {FoundLinkedRow} linkedRow
 * @returns {CalendarDate}
 */
export const lastCorrectionDayOf = ({
  options: { registeredOnly },
  previousYearLink
}) => lastCorrectionDay(previousYearLink.link.year, { registeredOnly })
