import { VALIDATION_CODE } from '#common/enums/validation.js'
import {
  isBeforeCorrectionDeadline,
  lastCorrectionDay
} from '#domain/summary-logs/correction-deadline.js'

import { toPreviousYearLinkIssue } from '../previous-year-link-issue.js'

/** @import {LinkedRowCheck} from './index.js' */

/**
 * Until the previous year can no longer be corrected, its row must be filled
 * in before a row can link to it.
 *
 * @type {LinkedRowCheck}
 */
export const previousYearRowMissingData = (linkedRow) => {
  const { rowObject, previousYearLink, linking, options } = linkedRow
  const { year, rowId } = previousYearLink.link
  if (
    !isBeforeCorrectionDeadline(year, options, options.createdAt) ||
    linking.missingFieldsOf(previousYearLink.previousYear).length === 0
  ) {
    return []
  }
  return [
    toPreviousYearLinkIssue({
      errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_MISSING_DATA,
      field: linking.previousYearRowIdField,
      linkedRow,
      enteredValue: rowObject[linking.previousYearRowIdField],
      previousYearRowId: rowId,
      deadline: lastCorrectionDay(year, options)
    })
  ]
}
