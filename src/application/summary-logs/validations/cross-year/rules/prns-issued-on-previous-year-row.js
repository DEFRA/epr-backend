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
export const prnsIssuedOnPreviousYearRow = ({
  linking,
  previousYearLink,
  issueLocation,
  ...linkedRow
}) =>
  [...issueLocation.headerToIndexMap]
    .filter(
      ([column]) =>
        column === linking.prnsIssuedField &&
        isYes(previousYearLink.previousYear[column])
    )
    .map(([field, index]) =>
      toPreviousYearLinkIssue({
        errorCode: VALIDATION_CODE.LINKED_ROW_PRNS_ISSUED,
        severity: VALIDATION_SEVERITY.WARNING,
        field,
        linkedRow: { ...linkedRow, issueLocation },
        enteredValue: previousYearLink.entered[index],
        previousYearRowId: previousYearLink.link.rowId
      })
    )
