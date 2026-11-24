import { isEprMarker } from '#domain/summary-logs/markers.js'
import {
  DROPDOWN_PLACEHOLDER,
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
 * @typedef {{ link: RowStateLink, entered: unknown[], previousYear: Record<string, unknown> }} LinkedRow
 */

/** @typedef {DataRow & { linked?: LinkedRow }} FilledInRow */

/**
 * @typedef {Pick<TableSchema, 'rowIdField' | 'wasteRecordType'> & { linking: YearLinking }} LinkingTableSchema
 */

/**
 * A placeholder counts as blank on both rows, so an untouched dropdown neither
 * supplies a value nor hides the previous year's.
 *
 * @param {unknown} value
 */
const isSupplied = (value) => isFilled(value, DROPDOWN_PLACEHOLDER)

/**
 * @param {{
 *   row: DataRow,
 *   headers: Array<string | null>,
 *   schema: LinkingTableSchema,
 *   previousYearRowState: SummaryLogRowState
 * }} params
 * @returns {FilledInRow}
 */
const fillInRow = ({
  row,
  headers,
  schema: { rowIdField, linking },
  previousYearRowState
}) => {
  const suppliable = new Set(linking.suppliableOnLinkedRow)
  /** @type {string[]} */
  const suppliedFields = []

  const values = headers.map((header, index) => {
    const entered = row.values[index]
    if (
      header === null ||
      isEprMarker(header) ||
      header === rowIdField ||
      header === linking.previousYearRowIdField
    ) {
      return entered
    }
    if (suppliable.has(header) && isSupplied(entered)) {
      suppliedFields.push(header)
      return entered
    }
    return previousYearRowState.data[header] ?? null
  })

  return {
    ...row,
    values,
    linked: {
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
 * @param {DataSection} section
 * @param {number} column
 * @returns {string[]}
 */
const previousYearRowIdsOf = (section, column) => [
  ...new Set(
    section.rows
      .map(({ values }) => values[column])
      .filter((value) => isFilled(value))
      .map(toRowId)
  )
]

/**
 * @param {{
 *   section: DataSection,
 *   schema: LinkingTableSchema,
 *   previousYearSubmission: PreviousYearSubmission,
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

  const previousYearRowStates =
    await summaryLogRowStatesRepository.findRowStatesInSummaryLog(
      previousYearSubmission.ledgerId,
      previousYearSubmission.summaryLogId,
      { wasteRecordType: schema.wasteRecordType, rowIds }
    )
  const byRowId = new Map(
    previousYearRowStates.map((state) => [state.rowId, state])
  )

  return {
    ...section,
    rows: section.rows.map((row) => {
      const previousYearRowState = byRowId.get(toRowId(row.values[column]))
      return previousYearRowState
        ? fillInRow({
            row,
            headers: section.headers,
            schema,
            previousYearRowState
          })
        : row
    })
  }
}

/**
 * Fills in each linked row of a log's tables that link years from the
 * previous year's row it names, in the submission the context was read from
 * (ADR-0060). Runs before every other data check, so they all read the
 * filled-in row. A row whose link resolves to no previous-year row is left as
 * written.
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
  if (previousYearSubmission === null) {
    return parsed
  }

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
