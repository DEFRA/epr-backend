import {
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { isYes } from '#domain/summary-logs/table-schemas/shared/answers.js'

import { toPreviousYearLinkIssue } from '../previous-year-link-issue.js'

/** @import {LinkedRowCheck} from './index.js' */

/**
 * A load whose previous year row had PRNs or PERNs issued is accepted but not
 * added to the waste balance, so the operator is told.
 *
 * @type {LinkedRowCheck}
 */
export const prnsIssuedOnPreviousYearRow = (linkedRow) => {
  const field = linkedRow.linking.prnsIssuedField
  return field && isYes(linkedRow.previousYearLink.previousYear[field])
    ? [
        toPreviousYearLinkIssue({
          errorCode: VALIDATION_CODE.LINKED_ROW_PRNS_ISSUED,
          severity: VALIDATION_SEVERITY.WARNING,
          field,
          linkedRow,
          enteredValue: linkedRow.rowObject[field],
          previousYearRowId: linkedRow.previousYearLink.link.rowId
        })
      ]
    : []
}
