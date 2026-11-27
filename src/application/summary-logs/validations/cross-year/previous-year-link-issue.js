import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { previousYear } from '#common/helpers/dates/year.js'

import { cellIssue } from '#common/validation/validation-issue-kinds.js'

import { buildCellLocation } from '../data-syntax.js'

/** @import {CellMessageCode, CellMessageFields} from '#common/validation/validation-issue-kinds.js' */
/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */
/** @import {LinkedRow} from './index.js' */
/** @import {PreviousYearLink} from '../../fill-in-linked-rows.js' */

/** @typedef {Extract<CellMessageCode, `PREVIOUS_YEAR_ROW_${string}`>} PreviousYearLinkCode */

/**
 * What a link error fills in besides the previous year, which every one gives.
 *
 * @typedef {{ [Code in PreviousYearLinkCode]: { errorCode: Code } & Omit<CellMessageFields[Code], 'expected'> }[PreviousYearLinkCode]} PreviousYearLinkMessage
 */

/**
 * @param {{
 *   field: string,
 *   linkedRow: Pick<LinkedRow<PreviousYearLink>, 'rowId' | 'options' | 'issueLocation'>,
 *   enteredValue: unknown
 * } & PreviousYearLinkMessage} params
 * @returns {ValidationIssue[]} the issue, or none where the table has no column for the field
 */
export const toPreviousYearLinkIssue = ({
  field,
  linkedRow,
  enteredValue,
  ...linkMessage
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
          message: `Previous year link ${linkMessage.errorCode} in column '${field}'`,
          code: VALIDATION_CODE.PREVIOUS_YEAR_LINK,
          location: cellLocation,
          actual: enteredValue,
          expected: previousYear(linkedRow.options.summaryLogYear),
          ...linkMessage
        })
      ]
    : []
}
