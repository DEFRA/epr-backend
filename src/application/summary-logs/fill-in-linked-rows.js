import {
  isFilledInColumn,
  PREVIOUS_YEAR_LINK_STATUS
} from '#domain/summary-logs/linked-row.js'
import {
  isAnswered,
  toRowId
} from '#domain/summary-logs/table-schemas/shared/index.js'
import { isFilled } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/** @import { DataRow, DataSection, ParsedSummaryLog } from '#domain/summary-logs/extractor/port.js' */
/** @import { TableSchema, TableSchemas, YearLinking } from '#domain/summary-logs/table-schemas/index.js' */
/** @import { RowStateLink, SummaryLogRowState } from '#waste-records/repository/schema.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */
/** @import { PreviousYearSubmission } from './classification-context.js' */

/**
 * A linked row's three versions (ADR-0060): `values` holds the filled-in row,
 * `entered` the row as entered and `previousYear` the previous-year row as
 * stored, for the rules that compare the years.
 *
 * @typedef {{
 *   status: typeof PREVIOUS_YEAR_LINK_STATUS.FOUND,
 *   link: RowStateLink,
 *   entered: readonly unknown[],
 *   previousYear: Record<string, unknown>
 * }} FoundPreviousYearLink
 */

/**
 * A row naming a previous-year row that the previous year's submission does
 * not have, or naming one when there is no such submission. The row is left
 * as written.
 *
 * @typedef {{
 *   status: typeof PREVIOUS_YEAR_LINK_STATUS.NOT_FOUND,
 *   previousYearRowId: string
 * }} NotFoundPreviousYearLink
 */

/** @typedef {FoundPreviousYearLink | NotFoundPreviousYearLink} PreviousYearLink */

/** @typedef {DataRow & { previousYearLink?: PreviousYearLink }} FilledInRow */

/**
 * @typedef {Pick<TableSchema, 'rowIdField' | 'wasteRecordType'> & { linking: YearLinking }} LinkingTableSchema
 */

/**
 * How fill-in treats a column: kept as entered, or taken from the previous
 * year unless the column is suppliable and the row supplies it.
 *
 * @typedef {{ kept: true } | { kept: false, header: string, suppliable: boolean }} FillInColumn
 */

/**
 * @param {(string | null)[]} headers
 * @param {LinkingTableSchema} schema
 * @returns {FillInColumn[]}
 */
const fillInColumnsOf = (headers, schema) => {
  const suppliable = new Set(schema.linking.suppliableOnLinkedRow)
  return headers.map((header) =>
    isFilledInColumn(header, schema)
      ? { kept: false, header, suppliable: suppliable.has(header) }
      : { kept: true }
  )
}

/**
 * @param {{
 *   row: DataRow,
 *   columns: FillInColumn[],
 *   previousYearRowState: SummaryLogRowState
 * }} params
 * @returns {FilledInRow}
 */
const fillInRow = ({ row, columns, previousYearRowState }) => {
  /** @type {string[]} */
  const suppliedFields = []

  const values = columns.map((column, index) => {
    const entered = row.values[index]
    if (column.kept) {
      return entered
    }
    // An untouched dropdown neither supplies a value nor hides the previous year's
    if (column.suppliable && isAnswered(entered)) {
      suppliedFields.push(column.header)
      return entered
    }
    return previousYearRowState.data[column.header] ?? null
  })

  return {
    ...row,
    values,
    previousYearLink: {
      status: PREVIOUS_YEAR_LINK_STATUS.FOUND,
      link: {
        year: previousYearRowState.year,
        rowId: previousYearRowState.rowId,
        rowStateId: previousYearRowState.id,
        // Sorted, so a template that moves a column gives the same link.
        suppliedFields: suppliedFields.toSorted((a, b) => a.localeCompare(b))
      },
      entered: row.values,
      previousYear: previousYearRowState.data
    }
  }
}

/**
 * A row ID typed as text, such as "1001 " or "1001.0", names the row the
 * row ID schema reads it as.
 *
 * @param {unknown} cellValue
 * @returns {string}
 */
const previousYearRowIdOf = (cellValue) => {
  const number = typeof cellValue === 'string' ? Number(cellValue) : cellValue
  return toRowId(Number.isFinite(number) ? number : cellValue)
}

/**
 * @param {DataSection} section
 * @param {number} column
 * @returns {string[]}
 */
const previousYearRowIdsOf = (section, column) => [
  ...new Set(
    section.rows
      .map(({ values }) => values[column])
      .filter((value) => isFilled(value))
      .map(previousYearRowIdOf)
  )
]

/**
 * @param {{
 *   previousYearSubmission: PreviousYearSubmission | null,
 *   schema: LinkingTableSchema,
 *   rowIds: string[],
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository
 * }} params
 * @returns {Promise<SummaryLogRowState[]>}
 */
const previousYearRowStatesOf = async ({
  previousYearSubmission,
  schema,
  rowIds,
  summaryLogRowStatesRepository
}) =>
  previousYearSubmission === null
    ? []
    : summaryLogRowStatesRepository.findRowStatesInSummaryLog(
        previousYearSubmission.ledgerId,
        previousYearSubmission.summaryLogId,
        { wasteRecordType: schema.wasteRecordType, rowIds }
      )

/**
 * @param {{
 *   section: DataSection,
 *   schema: LinkingTableSchema,
 *   previousYearSubmission: PreviousYearSubmission | null,
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository
 * }} params
 * @returns {Promise<DataSection>}
 */
const fillInTable = async ({
  section,
  schema,
  previousYearSubmission,
  summaryLogRowStatesRepository
}) => {
  const column = section.headers.indexOf(schema.linking.previousYearRowIdField)
  const rowIds = previousYearRowIdsOf(section, column)
  if (rowIds.length === 0) {
    return section
  }

  const previousYearRowStates = await previousYearRowStatesOf({
    previousYearSubmission,
    schema,
    rowIds,
    summaryLogRowStatesRepository
  })
  const byRowId = new Map(
    previousYearRowStates.map((state) => [state.rowId, state])
  )
  const columns = fillInColumnsOf(section.headers, schema)

  return {
    ...section,
    rows: section.rows.map((row) => {
      if (!isFilled(row.values[column])) {
        return row
      }
      const previousYearRowId = previousYearRowIdOf(row.values[column])
      const previousYearRowState = byRowId.get(previousYearRowId)
      return previousYearRowState
        ? fillInRow({ row, columns, previousYearRowState })
        : {
            ...row,
            previousYearLink: {
              status: PREVIOUS_YEAR_LINK_STATUS.NOT_FOUND,
              previousYearRowId
            }
          }
    })
  }
}

/**
 * Fills in each linked row of a log's tables that link years from the
 * previous year's row it names, in the submission the context was read from
 * (ADR-0060). Runs before every other data check, so they all read the
 * filled-in row. A row whose link resolves to no previous-year row, or that
 * names one when there is no previous-year submission, is left as written and
 * marked as not found.
 *
 * @param {{
 *   parsed: ParsedSummaryLog,
 *   tableSchemas: TableSchemas,
 *   previousYearSubmission: PreviousYearSubmission | null,
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository
 * }} params
 * @returns {Promise<ParsedSummaryLog>}
 */
export const fillInLinkedRows = async ({
  parsed,
  tableSchemas,
  previousYearSubmission,
  summaryLogRowStatesRepository
}) => {
  const tables = await Promise.all(
    Object.entries(parsed.data).map(async ([tableName, section]) => {
      const schema = tableSchemas[tableName]
      const linking = schema?.linking
      return [
        tableName,
        linking
          ? await fillInTable({
              section,
              schema: { ...schema, linking },
              previousYearSubmission,
              summaryLogRowStatesRepository
            })
          : section
      ]
    })
  )

  return { ...parsed, data: Object.fromEntries(tables) }
}
