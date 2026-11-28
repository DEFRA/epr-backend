import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { previousYear } from '#common/helpers/dates/year.js'

import { buildCellLocation } from '../data-syntax.js'

/** @import {ValidationSeverity} from '#common/enums/validation.js' */
/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */
/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */
/** @import {LinkedRow} from './index.js' */
/** @import {PreviousYearLink} from '../../fill-in-linked-rows.js' */

/**
 * @param {{
 *   errorCode: string,
 *   severity?: ValidationSeverity,
 *   field: string,
 *   linkedRow: Pick<LinkedRow<PreviousYearLink>, 'rowId' | 'options' | 'issueLocation'>,
 *   enteredValue: unknown,
 *   previousYearRowId?: string,
 *   deadline?: CalendarDate
 * }} params
 * @returns {ValidationIssue}
 */
export const toPreviousYearLinkIssue = ({
  errorCode,
  severity = VALIDATION_SEVERITY.FATAL,
  field,
  linkedRow,
  enteredValue,
  previousYearRowId,
  deadline
}) => {
  const { headerToIndexMap, tableName, rowNumber, location } =
    linkedRow.issueLocation
  return {
    category: VALIDATION_CATEGORY.BUSINESS,
    severity,
    message: `Previous year link ${errorCode} in column '${field}'`,
    code: VALIDATION_CODE.PREVIOUS_YEAR_LINK,
    context: {
      location: buildCellLocation({
        tableName,
        rowNumber,
        rowId: linkedRow.rowId,
        fieldName: field,
        colIndex: headerToIndexMap.get(field),
        location
      }),
      actual: enteredValue,
      expected: previousYear(linkedRow.options.summaryLogYear),
      errorCode,
      ...(previousYearRowId && { previousYearRowId }),
      ...(deadline && { deadline })
    }
  }
}
