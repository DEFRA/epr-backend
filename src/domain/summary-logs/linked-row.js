import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

import { isEprMarker } from './markers.js'
import { isAnswered } from './table-schemas/shared/answers.js'

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
 * `entered` and `previousYear` are as the column schema reads them, without
 * surrounding spaces; null when blank.
 *
 * @typedef {{
 *   comparison: PreviousYearComparison,
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
 *   linking: Pick<YearLinking, 'previousYearRowIdField' | 'prefilledOnLinkedRow'>
 * }} ComparedTable
 */

/**
 * @typedef {{
 *   columnSchema: Schema | undefined,
 *   isRounded: boolean
 * }} ComparedColumn
 */

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
 * @param {ComparedColumn} column
 * @param {unknown} cellValue
 * @returns {unknown}
 */
const comparableValueOf = ({ columnSchema, isRounded }, cellValue) => {
  if (!isAnswered(cellValue)) {
    return null
  }
  // A column with no value rule is compared as text: a number cell matches a text cell
  const read =
    columnSchema === undefined
      ? String(cellValue)
      : columnSchema.validate(cellValue).value
  if (typeof read === 'string') {
    return read.trim()
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

/**
 * How each filled-in column of a linked row, as entered, compares with the
 * previous year's row. A value the template fills in on a linked row reads as
 * blank there; in the previous year's row it is an answer. `roundedColumns`
 * are compared to two decimal places, as they are stored.
 *
 * @param {{
 *   table: ComparedTable,
 *   headers: Array<string | null>,
 *   columnSchemas: Map<string, Schema>,
 *   roundedColumns: ReadonlySet<string>,
 *   enteredRow: unknown[],
 *   previousYearRow: Record<string, unknown>
 * }} params
 * @returns {ReadonlyMap<string, ColumnComparison>}
 */
export const columnComparisonsOf = ({
  table,
  headers,
  columnSchemas,
  roundedColumns,
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
        isRounded: roundedColumns.has(header)
      }
      const enteredValue = enteredRow[index]
      const values = {
        entered:
          enteredValue === table.linking.prefilledOnLinkedRow[header]
            ? null
            : comparableValueOf(column, enteredValue),
        previousYear: comparableValueOf(column, previousYearRow[header])
      }
      return [
        /** @type {[string, ColumnComparison]} */ ([
          header,
          { comparison: comparisonOf(values), ...values }
        ])
      ]
    })
  )
