import { PREVIOUS_YEAR_COMPARISON } from '#domain/summary-logs/linked-row.js'
import { BEFORE_SUMMARY_LOG_YEAR_ERROR } from '#domain/summary-logs/table-schemas/shared/field-schemas.js'
import {
  ROW_OUTCOME,
  toValidationErrorIssue
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import { toApplicationIssue } from '../../data-syntax.js'

/** @import {FoundLinkedRow} from '../index.js' */
/** @import {LinkedRowCheck} from './index.js' */

/**
 * The supplied columns the previous year's row leaves blank, or that may differ
 * from it; a different value elsewhere is rejected as such.
 *
 * @param {FoundLinkedRow} linkedRow
 * @returns {string[]}
 */
const suppliedColumnsNewOrMayDiffer = ({
  columnComparisons,
  previousYearLink,
  linking
}) => {
  const supplied = new Set(previousYearLink.link.suppliedFields)
  const mayDiffer = new Set(linking.mayDifferBeforeCorrectionDeadline)
  return [...columnComparisons]
    .filter(
      ([column, { comparison }]) =>
        supplied.has(column) &&
        (comparison === PREVIOUS_YEAR_COMPARISON.ADDED ||
          (comparison === PREVIOUS_YEAR_COMPARISON.CHANGED &&
            mayDiffer.has(column)))
    )
    .map(([column]) => column)
}

/** @type {LinkedRowCheck} */
export const earlierYearDates = (linkedRow) =>
  suppliedColumnsNewOrMayDiffer(linkedRow).flatMap((field) => {
    const columnSchema = linkedRow.columnSchemas.get(field)
    if (columnSchema === undefined) {
      return []
    }
    const { error } = columnSchema.validate(linkedRow.rowObject[field], {
      context: linkedRow.options
    })
    return (error?.details ?? [])
      .filter(({ type }) => type === BEFORE_SUMMARY_LOG_YEAR_ERROR)
      .map((detail) =>
        toApplicationIssue({
          issue: toValidationErrorIssue(detail, field),
          classification: { outcome: ROW_OUTCOME.REJECTED },
          rowId: linkedRow.rowId,
          ...linkedRow.issueLocation
        })
      )
  })
