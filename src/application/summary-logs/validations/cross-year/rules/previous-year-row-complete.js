import { VALIDATION_CODE } from '#common/enums/validation.js'
import { PREVIOUS_YEAR_ROW_COMPLETION } from '#domain/summary-logs/linked-row.js'

import { toPreviousYearLinkIssue } from '../previous-year-link-issue.js'

/** @import {FoundLinkedRow} from '../index.js' */
/** @import {LinkedRowCheck} from './index.js' */

const COMPLETION_ERROR_CODES = Object.freeze({
  [PREVIOUS_YEAR_ROW_COMPLETION.RECEIVED_BY_OSR]:
    VALIDATION_CODE.PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR,
  [PREVIOUS_YEAR_ROW_COMPLETION.REPATRIATED]:
    VALIDATION_CODE.PREVIOUS_YEAR_ROW_REPATRIATED
})

/**
 * What the operator entered in the cell, not the previous year's value fill-in
 * put there.
 *
 * @param {FoundLinkedRow} linkedRow
 * @param {string} field
 * @returns {unknown}
 */
const enteredValueOf = ({ rowObject, previousYearLink, linking }, field) =>
  field === linking.previousYearRowIdField ||
  previousYearLink.link.suppliedFields.includes(field)
    ? rowObject[field]
    : null

/** @type {LinkedRowCheck} */
export const previousYearRowComplete = (linkedRow) =>
  linkedRow.completions.map(({ completion, field }) =>
    toPreviousYearLinkIssue({
      enteredValue: enteredValueOf(linkedRow, field),
      errorCode: COMPLETION_ERROR_CODES[completion],
      field,
      linkedRow
    })
  )
