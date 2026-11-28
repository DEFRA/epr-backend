import { VALIDATION_CODE } from '#common/enums/validation.js'
import { LINKED_COLUMN_CHECK } from '#domain/summary-logs/linked-row.js'

import { toPreviousYearLinkIssue } from '../previous-year-link-issue.js'
import { isStillCorrectable, lastCorrectionDayOf } from './correction-window.js'

/** @import {FoundLinkedRow} from '../index.js' */
/** @import {LinkedRowCheck} from './index.js' */

/**
 * Each column the row gives differently, with where the row has it.
 *
 * @param {FoundLinkedRow} linkedRow
 * @returns {Array<[string, number]>}
 */
const columnsGivenDifferently = ({ columnComparisons, issueLocation }) =>
  [...issueLocation.headerToIndexMap].filter(
    ([column]) =>
      columnComparisons.get(column)?.check === LINKED_COLUMN_CHECK.VALUE_DIFFERS
  )

/**
 * While the previous year can still be corrected, a change to its row is made
 * there, not on the linked row.
 *
 * @type {LinkedRowCheck}
 */
export const previousYearRowValueDiffers = (linkedRow) =>
  isStillCorrectable(linkedRow)
    ? columnsGivenDifferently(linkedRow).map(([field, index]) =>
        toPreviousYearLinkIssue({
          deadline: lastCorrectionDayOf(linkedRow),
          // As typed: fill-in has put the previous year's value in a column the row may not supply
          enteredValue: linkedRow.previousYearLink.entered[index],
          errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_VALUE_DIFFERS,
          field,
          linkedRow
        })
      )
    : []
