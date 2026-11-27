import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

import { isEprMarker } from './markers.js'
import { STORED_TONNAGE_FIELDS } from './stored-tonnage-fields.js'
import { isAnswered, isNo, isYes } from './table-schemas/shared/answers.js'
import { YES_NO_VALUES } from './table-schemas/shared/joi-messages.js'

/** @import {Schema} from 'joi' */
/** @import {TableSchema, YearLinking} from './table-schemas/index.js' */

/**
 * Whether a row's Previous year Row ID names a row in the previous year's
 * submission (ADR-0060).
 */
export const PREVIOUS_YEAR_LINK_STATUS = Object.freeze(
  /** @type {const} */ ({
    FOUND: 'FOUND',
    NOT_FOUND: 'NOT_FOUND'
  })
)

/** @typedef {typeof PREVIOUS_YEAR_LINK_STATUS[keyof typeof PREVIOUS_YEAR_LINK_STATUS]} PreviousYearLinkStatus */

/**
 * How a previous year's row shows its load finished, so no later row can link
 * to it. Each table that links years adds the ways its loads finish.
 */
export const PREVIOUS_YEAR_ROW_COMPLETION = Object.freeze(
  /** @type {const} */ ({
    RECEIVED_BY_OSR: 'RECEIVED_BY_OSR',
    REPATRIATED: 'REPATRIATED'
  })
)

/** @typedef {typeof PREVIOUS_YEAR_ROW_COMPLETION[keyof typeof PREVIOUS_YEAR_ROW_COMPLETION]} PreviousYearRowCompletion */

/**
 * `field` is the column the linked row's error sits on.
 *
 * @typedef {{ completion: PreviousYearRowCompletion, field: string }} PreviousYearRowCompletionAt
 */

/**
 * How a linked row's column compares with the previous year's row. INHERITED:
 * the linked row left it blank. ADDED: only the linked row has it.
 */
export const PREVIOUS_YEAR_COMPARISON = Object.freeze(
  /** @type {const} */ ({
    SAME: 'SAME',
    INHERITED: 'INHERITED',
    ADDED: 'ADDED',
    CHANGED: 'CHANGED'
  })
)

/** @typedef {typeof PREVIOUS_YEAR_COMPARISON[keyof typeof PREVIOUS_YEAR_COMPARISON]} PreviousYearComparison */

/**
 * Which rule checks a linked row's column: a value only the linked row has, or
 * one it may give differently, must not be in an earlier year that is still
 * open; any other change is a different value.
 */
export const LINKED_COLUMN_CHECK = Object.freeze(
  /** @type {const} */ ({
    NONE: 'NONE',
    EARLIER_YEAR_DATE: 'EARLIER_YEAR_DATE',
    VALUE_DIFFERS: 'VALUE_DIFFERS'
  })
)

/** @typedef {typeof LINKED_COLUMN_CHECK[keyof typeof LINKED_COLUMN_CHECK]} LinkedColumnCheck */

/**
 * `entered` and `previousYear` are as the column schema reads them, without
 * surrounding spaces; null when blank.
 *
 * @typedef {{
 *   comparison: PreviousYearComparison,
 *   check: LinkedColumnCheck,
 *   entered: unknown,
 *   previousYear: unknown
 * }} ColumnComparison
 */

/**
 * @typedef {Pick<TableSchema, 'rowIdField'> & {
 *   linking: Pick<YearLinking, 'previousYearRowIdField'>
 * }} LinkingTable
 */

/**
 * @typedef {Pick<TableSchema, 'rowIdField'> & {
 *   linking: Pick<
 *     YearLinking,
 *     | 'previousYearRowIdField'
 *     | 'prefilledOnLinkedRow'
 *     | 'mayDifferBeforeCorrectionDeadline'
 *     | 'answeredLaterOnLinkedRow'
 *   >
 * }} ComparedTable
 */

/**
 * @typedef {{
 *   columnSchema: Schema | undefined,
 *   isRounded: boolean,
 *   isYesNo: boolean
 * }} ComparedColumn
 */

const STORED_TONNAGE_COLUMNS = new Set(STORED_TONNAGE_FIELDS)

/**
 * Whether fill-in takes the column from the previous year's row: a named data
 * column other than the row's own Row ID and its Previous year Row ID.
 *
 * @param {string | null} header
 * @param {LinkingTable} table
 * @returns {header is string}
 */
export const isFilledInColumn = (header, { rowIdField, linking }) =>
  header !== null &&
  !isEprMarker(header) &&
  header !== rowIdField &&
  header !== linking.previousYearRowIdField

/**
 * @param {unknown} cellValue
 * @returns {unknown}
 */
const textOf = (cellValue) =>
  typeof cellValue === 'number' ? String(cellValue) : cellValue

/**
 * @param {string} answer
 * @returns {string}
 */
const yesNoOf = (answer) => {
  if (isYes(answer)) {
    return YES_NO_VALUES.YES
  }
  return isNo(answer) ? YES_NO_VALUES.NO : answer
}

/**
 * @param {ComparedColumn} column
 * @param {unknown} cellValue
 * @returns {unknown}
 */
const comparableValueOf = ({ columnSchema, isRounded, isYesNo }, cellValue) => {
  if (!isAnswered(cellValue)) {
    return null
  }
  // A column with no value rule is compared as text: a number cell matches a text cell
  const read =
    columnSchema === undefined
      ? textOf(cellValue)
      : columnSchema.validate(cellValue).value
  if (typeof read === 'string') {
    // As classification reads them: the accredited table stores them as typed
    return isYesNo ? yesNoOf(read.trim()) : read.trim()
  }
  // Stored tonnages are held to two decimal places (coerceStoredTonnages)
  return isRounded && typeof read === 'number'
    ? roundToTwoDecimalPlaces(read)
    : read
}

/**
 * @param {{ entered: unknown, previousYear: unknown }} values
 * @returns {PreviousYearComparison}
 */
const comparisonOf = ({ entered, previousYear }) => {
  if (entered === null) {
    return PREVIOUS_YEAR_COMPARISON.INHERITED
  }
  if (previousYear === null) {
    return PREVIOUS_YEAR_COMPARISON.ADDED
  }
  return entered === previousYear
    ? PREVIOUS_YEAR_COMPARISON.SAME
    : PREVIOUS_YEAR_COMPARISON.CHANGED
}

/** @type {Readonly<Record<PreviousYearComparison, (mayDiffer: boolean) => LinkedColumnCheck>>} */
const CHECK_BY_COMPARISON = Object.freeze({
  [PREVIOUS_YEAR_COMPARISON.SAME]: () => LINKED_COLUMN_CHECK.NONE,
  [PREVIOUS_YEAR_COMPARISON.INHERITED]: () => LINKED_COLUMN_CHECK.NONE,
  [PREVIOUS_YEAR_COMPARISON.ADDED]: () => LINKED_COLUMN_CHECK.EARLIER_YEAR_DATE,
  [PREVIOUS_YEAR_COMPARISON.CHANGED]: (mayDiffer) =>
    mayDiffer
      ? LINKED_COLUMN_CHECK.EARLIER_YEAR_DATE
      : LINKED_COLUMN_CHECK.VALUE_DIFFERS
})

/**
 * Whether the linked row may give the column differently while the previous
 * year can still be corrected.
 *
 * @param {ComparedTable['linking']} linking
 * @param {string} header
 * @param {unknown} previousYear
 * @returns {boolean}
 */
const mayDifferOf = (linking, header, previousYear) =>
  linking.mayDifferBeforeCorrectionDeadline.includes(header) ||
  (linking.answeredLaterOnLinkedRow.includes(header) &&
    previousYear === YES_NO_VALUES.NO)

/**
 * How each filled-in column of a linked row, as entered, compares with the
 * previous year's row, and which rule checks it. A value the template fills in
 * on a linked row reads as blank there; in the previous year's row it is an
 * answer. Stored tonnages are compared to two decimal places.
 *
 * @param {{
 *   table: ComparedTable,
 *   headers: Array<string | null>,
 *   columnSchemas: Map<string, Schema>,
 *   enteredRow: unknown[],
 *   previousYearRow: Record<string, unknown>
 * }} params
 * @returns {ReadonlyMap<string, ColumnComparison>}
 */
export const columnComparisonsOf = ({
  table,
  headers,
  columnSchemas,
  enteredRow,
  previousYearRow
}) =>
  new Map(
    headers.flatMap((header, index) => {
      if (!isFilledInColumn(header, table)) {
        return []
      }
      const column = {
        columnSchema: columnSchemas.get(header),
        isRounded: STORED_TONNAGE_COLUMNS.has(header),
        isYesNo: table.linking.answeredLaterOnLinkedRow.includes(header)
      }
      const enteredValue = enteredRow[index]
      const values = {
        entered:
          enteredValue === table.linking.prefilledOnLinkedRow[header]
            ? null
            : comparableValueOf(column, enteredValue),
        previousYear: comparableValueOf(column, previousYearRow[header])
      }
      const comparison = comparisonOf(values)
      const check = CHECK_BY_COMPARISON[comparison](
        mayDifferOf(table.linking, header, values.previousYear)
      )
      return [
        /** @type {[string, ColumnComparison]} */ ([
          header,
          { comparison, check, ...values }
        ])
      ]
    })
  )
