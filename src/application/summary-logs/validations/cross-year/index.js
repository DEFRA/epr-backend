import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  columnComparisonsOf,
  PREVIOUS_YEAR_LINK_STATUS
} from '#domain/summary-logs/linked-row.js'
import { isHeaderDescriptionRow } from '#domain/summary-logs/markers.js'
import { CLASSIFICATION_REASON } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { toRowId } from '#domain/summary-logs/table-schemas/shared/row-id.schema.js'
import {
  isFilled,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import { buildHeaderToIndexMap, toApplicationIssue } from '../data-syntax.js'
import { linkedRowIssuesOf } from './rules/index.js'
import { previousYearRowNotFound } from './previous-year-row-not-found.js'

/** @import {Schema} from 'joi' */
/** @import {ValidationIssue, ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {CellLocation, ParsedSummaryLog} from '#domain/summary-logs/extractor/port.js' */
/** @import {ColumnComparison, LinkingTable, PreviousYearRowCompletionAt} from '#domain/summary-logs/linked-row.js' */
/** @import {TableSchema, YearLinking} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {SummaryLogValidationOptions} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {FilledInRow, FoundPreviousYearLink, PreviousYearLink} from '../../fill-in-linked-rows.js' */

/** @typedef {Pick<TableSchema, 'rowIdField' | 'validationSchema' | 'linking'>} CrossYearTableSchema */

/**
 * @typedef {{
 *   headerToIndexMap: Map<string, number>,
 *   rowObject: Record<string, unknown>,
 *   tableName: string,
 *   rowNumber: number,
 *   location: CellLocation
 * }} RowIssueLocation
 */

/**
 * @template {PreviousYearLink} Link
 * @typedef {{
 *   rowObject: Record<string, unknown>,
 *   rowId: string,
 *   previousYearLink: Link,
 *   linking: YearLinking,
 *   columnSchemas: ReadonlyMap<string, Schema>,
 *   options: SummaryLogValidationOptions,
 *   issueLocation: RowIssueLocation
 * }} LinkedRow
 */

/**
 * What every rule on a found link reads, worked out once per row.
 *
 * @typedef {LinkedRow<FoundPreviousYearLink> & {
 *   columnComparisons: ReadonlyMap<string, ColumnComparison>,
 *   completions: readonly PreviousYearRowCompletionAt[]
 * }} FoundLinkedRow
 */

/**
 * @param {CrossYearTableSchema['validationSchema']} validationSchema
 * @returns {Map<string, Schema>}
 */
const columnSchemasOf = (validationSchema) =>
  new Map(
    Object.keys(validationSchema.describe().keys).map((column) => [
      column,
      validationSchema.extract(column)
    ])
  )

/**
 * @param {LinkedRow<FoundPreviousYearLink> & {
 *   table: LinkingTable,
 *   headers: readonly (string | null)[]
 * }} params
 * @returns {FoundLinkedRow}
 */
const foundLinkedRowOf = ({ table, headers, ...linkedRow }) => {
  const { previousYearLink, linking, columnSchemas } = linkedRow
  return {
    ...linkedRow,
    columnComparisons: columnComparisonsOf({
      table,
      headers,
      columnSchemas,
      enteredRow: previousYearLink.entered,
      previousYearRow: previousYearLink.previousYear
    }),
    completions: linking.completionsOf(
      previousYearLink.previousYear,
      previousYearLink.link.year
    )
  }
}

/**
 * @param {{
 *   tableName: string,
 *   headers: (string | null)[],
 *   rows: readonly FilledInRow[],
 *   location: CellLocation,
 *   schema: CrossYearTableSchema,
 *   linking: YearLinking,
 *   options: SummaryLogValidationOptions
 * }} params
 * @returns {ValidationIssue[]}
 */
const checkTable = ({
  tableName,
  headers,
  rows,
  location,
  schema,
  linking,
  options
}) => {
  const headerToIndexMap = buildHeaderToIndexMap(headers)
  const columnSchemas = columnSchemasOf(schema.validationSchema)
  const table = { rowIdField: schema.rowIdField, linking }

  return rows.flatMap(({ rowNumber, values, previousYearLink }) => {
    if (previousYearLink === undefined) {
      return []
    }
    /** @type {Record<string, unknown>} */
    const rowObject = Object.fromEntries(
      [...headerToIndexMap].map(([header, index]) => [header, values[index]])
    )
    const rowIdValue = rowObject[schema.rowIdField]
    if (isHeaderDescriptionRow(rowIdValue)) {
      return []
    }
    const issueLocation = {
      headerToIndexMap,
      rowObject,
      tableName,
      rowNumber,
      location
    }

    if (!isFilled(rowIdValue)) {
      return previousYearLink.status === PREVIOUS_YEAR_LINK_STATUS.FOUND
        ? [
            toApplicationIssue({
              issue: {
                code: CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD,
                field: schema.rowIdField
              },
              classification: { outcome: ROW_OUTCOME.REJECTED },
              ...issueLocation
            })
          ]
        : []
    }

    const row = {
      rowObject,
      rowId: toRowId(rowIdValue),
      linking,
      columnSchemas,
      options,
      issueLocation
    }
    return previousYearLink.status === PREVIOUS_YEAR_LINK_STATUS.FOUND
      ? linkedRowIssuesOf(
          foundLinkedRowOf({
            ...row,
            previousYearLink,
            table,
            headers
          })
        )
      : previousYearRowNotFound({ ...row, previousYearLink })
  })
}

/**
 * The rules on a row that names a previous year's row (ADR-0060): that the
 * row exists, that it is still open, and how the linked row compares with
 * it. The field schemas know only that a row was filled in.
 *
 * @param {{
 *   parsed: ParsedSummaryLog,
 *   tableSchemas: Record<string, CrossYearTableSchema>,
 *   options: SummaryLogValidationOptions
 * }} params
 * @returns {ValidationIssuesCollector}
 */
export const checkCrossYearRules = ({ parsed, tableSchemas, options }) =>
  createValidationIssues(
    Object.entries(parsed.data).flatMap(
      ([tableName, { headers, rows, location }]) => {
        const schema = tableSchemas[tableName]
        const linking = schema?.linking
        return linking
          ? checkTable({
              tableName,
              headers,
              rows,
              location,
              schema,
              linking,
              options
            })
          : []
      }
    )
  )
