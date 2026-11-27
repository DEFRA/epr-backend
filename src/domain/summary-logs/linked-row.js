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
 * @param {Schema | undefined} columnSchema
 * @param {unknown} cellValue
 * @returns {unknown}
 */
const comparableValueOf = (columnSchema, cellValue) => {
  if (!isAnswered(cellValue)) {
    return null
  }
  const read =
    columnSchema === undefined
      ? cellValue
      : columnSchema.validate(cellValue).value
  return typeof read === 'string' ? read.trim() : read
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
 * previous year's row.
 *
 * @param {{
 *   table: LinkingTable,
 *   headers: readonly (string | null)[],
 *   columnSchemas: ReadonlyMap<string, Schema>,
 *   enteredRow: readonly unknown[],
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
      const columnSchema = columnSchemas.get(header)
      const values = {
        entered: comparableValueOf(columnSchema, enteredRow[index]),
        previousYear: comparableValueOf(columnSchema, previousYearRow[header])
      }
      return [
        /** @type {[string, ColumnComparison]} */ ([
          header,
          { comparison: comparisonOf(values), ...values }
        ])
      ]
    })
  )
