import { LINKED_COLUMN_CHECK } from '#domain/summary-logs/linked-row.js'
import { BEFORE_SUMMARY_LOG_YEAR_ERROR } from '#domain/summary-logs/table-schemas/shared/field-schemas.js'
import {
  ROW_OUTCOME,
  toValidationErrorIssue
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import { toApplicationIssue } from '../../data-syntax.js'

/** @import {FoundLinkedRow} from '../index.js' */
/** @import {LinkedRowCheck} from './index.js' */

/**
 * @param {FoundLinkedRow} linkedRow
 * @returns {string[]}
 */
const suppliedColumnsCheckedAsDates = ({
  columnComparisons,
  previousYearLink
}) => {
  const supplied = new Set(previousYearLink.link.suppliedFields)
  return [...columnComparisons]
    .filter(
      ([column, { check }]) =>
        supplied.has(column) && check === LINKED_COLUMN_CHECK.EARLIER_YEAR_DATE
    )
    .map(([column]) => column)
}

/** @type {LinkedRowCheck} */
export const earlierYearDates = (linkedRow) =>
  suppliedColumnsCheckedAsDates(linkedRow).flatMap((field) => {
    const columnSchema = linkedRow.columnSchemas.get(field)
    if (columnSchema === undefined) {
      return []
    }
    const { error } = columnSchema.validate(linkedRow.rowObject[field], {
      context: linkedRow.options
    })
    return (error?.details ?? [])
      .filter(({ type }) => type === BEFORE_SUMMARY_LOG_YEAR_ERROR)
      .flatMap((detail) =>
        toApplicationIssue({
          issue: toValidationErrorIssue(detail, field),
          classification: { outcome: ROW_OUTCOME.REJECTED },
          rowId: linkedRow.rowId,
          ...linkedRow.issueLocation
        })
      )
  })
