import { VALIDATION_CODE } from '#common/enums/validation.js'
import {
  isBeforeCorrectionDeadline,
  lastCorrectionDay
} from '#domain/summary-logs/correction-deadline.js'

import { toPreviousYearLinkIssue } from '../previous-year-link-issue.js'

/** @import {FoundLinkedRow} from '../index.js' */
/** @import {LinkedRowCheck} from './index.js' */

/** @param {FoundLinkedRow} linkedRow */
const isStillCorrectable = ({
  options: { createdAt, registeredOnly },
  previousYearLink
}) =>
  isBeforeCorrectionDeadline(
    previousYearLink.link.year,
    { registeredOnly },
    createdAt
  )

/** @param {FoundLinkedRow} linkedRow */
const isMissingData = ({ linking, previousYearLink }) =>
  linking.missingFieldsOf(previousYearLink.previousYear).length > 0

/**
 * Until the previous year can no longer be corrected, its row must be filled
 * in before a row can link to it.
 *
 * @type {LinkedRowCheck}
 */
export const previousYearRowMissingData = (linkedRow) => {
  const {
    linking,
    options: { registeredOnly },
    previousYearLink,
    rowObject
  } = linkedRow
  const { rowId, year } = previousYearLink.link
  return isStillCorrectable(linkedRow) && isMissingData(linkedRow)
    ? [
        toPreviousYearLinkIssue({
          deadline: lastCorrectionDay(year, { registeredOnly }),
          enteredValue: rowObject[linking.previousYearRowIdField],
          errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_MISSING_DATA,
          field: linking.previousYearRowIdField,
          linkedRow,
          previousYearRowId: rowId
        })
      ]
    : []
}
