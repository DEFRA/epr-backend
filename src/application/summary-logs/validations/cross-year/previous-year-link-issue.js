import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { previousYear } from '#common/helpers/dates/year.js'
import { PREVIOUS_YEAR_LINK_STATUS } from '#domain/summary-logs/linked-row.js'

import { buildCellLocation } from '../data-syntax.js'

/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */
/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */
/** @import {LinkedRow} from './index.js' */
/** @import {PreviousYearLink} from '../../fill-in-linked-rows.js' */

/**
 * @param {{
 *   deadline?: CalendarDate,
 *   enteredValue: unknown,
 *   errorCode: string,
 *   field: string,
 *   linkedRow: Pick<LinkedRow<PreviousYearLink>, 'issueLocation' | 'options' | 'previousYearLink' | 'rowId'>
 * }} params
 * @returns {ValidationIssue}
 */
export const toPreviousYearLinkIssue = ({
  deadline,
  enteredValue,
  errorCode,
  field,
  linkedRow
}) => {
  const { headerToIndexMap, location, rowNumber, tableName } =
    linkedRow.issueLocation
  const { previousYearLink } = linkedRow
  return {
    category: VALIDATION_CATEGORY.BUSINESS,
    severity: VALIDATION_SEVERITY.FATAL,
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
      ...(previousYearLink.status === PREVIOUS_YEAR_LINK_STATUS.FOUND && {
        previousYearRowId: previousYearLink.link.rowId
      }),
      ...(deadline && { deadline })
    }
  }
}
