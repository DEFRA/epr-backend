import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { previousYear } from '#common/helpers/dates/year.js'

import { cellIssue } from '#common/validation/validation-issue-kinds.js'

import { buildCellLocation } from '../data-syntax.js'

/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */
/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */
/** @import {LinkedRow} from './index.js' */
/** @import {PreviousYearLink} from '../../fill-in-linked-rows.js' */

/**
 * @param {{
 *   errorCode: string,
 *   field: string,
 *   linkedRow: Pick<LinkedRow<PreviousYearLink>, 'rowId' | 'options' | 'issueLocation'>,
 *   enteredValue: unknown,
 *   previousYearRowId?: string,
 *   deadline?: CalendarDate
 * }} params
 * @returns {ValidationIssue[]} the issue, or none where the table has no column for the field
 */
export const toPreviousYearLinkIssue = ({
  errorCode,
  field,
  linkedRow,
  enteredValue,
  previousYearRowId,
  deadline
}) => {
  const { headerToIndexMap, tableName, rowNumber, location } =
    linkedRow.issueLocation
  const cellLocation = buildCellLocation({
    tableName,
    rowNumber,
    rowId: linkedRow.rowId,
    fieldName: field,
    colIndex: headerToIndexMap.get(field),
    location
  })
  return cellLocation
    ? [
        cellIssue({
          severity: VALIDATION_SEVERITY.FATAL,
          category: VALIDATION_CATEGORY.BUSINESS,
          message: `Previous year link ${errorCode} in column '${field}'`,
          code: VALIDATION_CODE.PREVIOUS_YEAR_LINK,
          location: cellLocation,
          actual: enteredValue,
          expected: previousYear(linkedRow.options.summaryLogYear),
          errorCode,
          ...(previousYearRowId && { previousYearRowId }),
          ...(deadline && { deadline })
        })
      ]
    : []
}
