import { VALIDATION_CODE } from '#common/enums/validation.js'

import { toPreviousYearLinkIssue } from './previous-year-link-issue.js'

/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */
/** @import {LinkedRow} from './index.js' */
/** @import {NotFoundPreviousYearLink} from '../../fill-in-linked-rows.js' */

/**
 * A previous year row ID the data syntax check rejects gets only that error.
 *
 * @param {LinkedRow<NotFoundPreviousYearLink>} linkedRow
 * @returns {readonly ValidationIssue[]}
 */
export const previousYearRowNotFound = (linkedRow) => {
  const field = linkedRow.linking.previousYearRowIdField
  const isWellFormed =
    linkedRow.columnSchemas
      .get(field)
      ?.validate(linkedRow.rowObject[field], { context: linkedRow.options })
      .error === undefined
  return isWellFormed
    ? [
        toPreviousYearLinkIssue({
          enteredValue: linkedRow.rowObject[field],
          errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_NOT_FOUND,
          field,
          linkedRow
        })
      ]
    : []
}
