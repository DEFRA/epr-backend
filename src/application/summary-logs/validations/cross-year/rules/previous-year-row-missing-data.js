import { VALIDATION_CODE } from '#common/enums/validation.js'

import { toPreviousYearLinkIssue } from '../previous-year-link-issue.js'
import { isStillCorrectable, lastCorrectionDayOf } from './correction-window.js'

/** @import {FoundLinkedRow} from '../index.js' */
/** @import {LinkedRowCheck} from './index.js' */

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
  const { linking, rowObject } = linkedRow
  return isStillCorrectable(linkedRow) && isMissingData(linkedRow)
    ? [
        toPreviousYearLinkIssue({
          deadline: lastCorrectionDayOf(linkedRow),
          enteredValue: rowObject[linking.previousYearRowIdField],
          errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_MISSING_DATA,
          field: linking.previousYearRowIdField,
          linkedRow
        })
      ]
    : []
}
