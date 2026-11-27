import { PREVIOUS_YEAR_COMPARISON } from '#domain/summary-logs/linked-row.js'
import { BEFORE_SUMMARY_LOG_YEAR_ERROR } from '#domain/summary-logs/table-schemas/shared/field-schemas.js'
import {
  ROW_OUTCOME,
  toValidationErrorIssue
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import { toApplicationIssue } from '../../data-syntax.js'

/** @import {PreviousYearComparison} from '#domain/summary-logs/linked-row.js' */
/** @import {FoundLinkedRow} from '../index.js' */
/** @import {LinkedRowCheck} from './index.js' */

/** @type {ReadonlySet<PreviousYearComparison>} */
const DIFFERS_FROM_PREVIOUS_YEAR = new Set([
  PREVIOUS_YEAR_COMPARISON.ADDED,
  PREVIOUS_YEAR_COMPARISON.CHANGED
])

/**
 * @param {FoundLinkedRow} linkedRow
 * @returns {readonly string[]}
 */
const suppliedColumnsDifferingFromPreviousYear = ({
  columnComparisons,
  previousYearLink
}) => {
  const supplied = new Set(previousYearLink.link.suppliedFields)
  return [...columnComparisons]
    .filter(
      ([column, { comparison }]) =>
        supplied.has(column) && DIFFERS_FROM_PREVIOUS_YEAR.has(comparison)
    )
    .map(([column]) => column)
}

/** @type {LinkedRowCheck} */
export const earlierYearDates = (linkedRow) =>
  suppliedColumnsDifferingFromPreviousYear(linkedRow).flatMap((field) => {
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
