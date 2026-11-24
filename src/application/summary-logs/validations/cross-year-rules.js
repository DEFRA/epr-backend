import { createValidationIssues } from '#common/validation/validation-issues.js'
import { BEFORE_SUMMARY_LOG_YEAR_ERROR } from '#domain/summary-logs/table-schemas/shared/field-schemas.js'
import { toRowId } from '#domain/summary-logs/table-schemas/shared/row-id.schema.js'
import {
  isFilled,
  ROW_OUTCOME,
  toValidationErrorIssue
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import { buildHeaderToIndexMap, toApplicationIssue } from './data-syntax.js'

/** @import {Schema} from 'joi' */
/** @import {ValidationIssue, ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {CellLocation, ParsedSummaryLog} from '#domain/summary-logs/extractor/port.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {SummaryLogValidationOptions} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {FilledInRow, LinkedRow} from '../fill-in-linked-rows.js' */

/** @typedef {Pick<TableSchema, 'rowIdField' | 'validationSchema'>} CrossYearTableSchema */

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
 * @param {Schema} schema
 * @param {unknown} value
 */
const coerced = (schema, value) => schema.validate(value).value

/**
 * @param {{
 *   rowObject: Record<string, unknown>,
 *   linked: LinkedRow,
 *   columnSchemas: Map<string, Schema>,
 *   options: SummaryLogValidationOptions
 * }} params
 * @returns {Array<{ field: string, detail: import('joi').ValidationErrorItem }>}
 */
const earlierYearDatesOf = ({ rowObject, linked, columnSchemas, options }) =>
  linked.link.suppliedFields.flatMap((field) => {
    const schema = columnSchemas.get(field)
    const value = rowObject[field]
    if (
      schema === undefined ||
      coerced(schema, value) === coerced(schema, linked.previousYear[field])
    ) {
      return []
    }
    const { error } = schema.validate(value, { context: options })
    return (error?.details ?? [])
      .filter(({ type }) => type === BEFORE_SUMMARY_LOG_YEAR_ERROR)
      .map((detail) => ({ field, detail }))
  })

/**
 * @param {{
 *   tableName: string,
 *   headers: Array<string | null>,
 *   rows: FilledInRow[],
 *   location: CellLocation,
 *   schema: CrossYearTableSchema,
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
  options
}) => {
  const headerToIndexMap = buildHeaderToIndexMap(headers)
  const columnSchemas = columnSchemasOf(schema.validationSchema)

  return rows.flatMap(({ rowNumber, values, linked }) => {
    if (linked === undefined) {
      return []
    }
    /** @type {Record<string, unknown>} */
    const rowObject = {}
    for (const [header, index] of headerToIndexMap) {
      rowObject[header] = values[index]
    }
    const issueAt = {
      headerToIndexMap,
      rowObject,
      tableName,
      rowNumber,
      location
    }

    if (!isFilled(rowObject[schema.rowIdField])) {
      return [
        toApplicationIssue({
          issue: { code: 'MISSING_REQUIRED_FIELD', field: schema.rowIdField },
          classification: { outcome: ROW_OUTCOME.REJECTED },
          ...issueAt
        })
      ]
    }
    const rowId = toRowId(rowObject[schema.rowIdField])

    return earlierYearDatesOf({
      rowObject,
      linked,
      columnSchemas,
      options
    }).map(({ field, detail }) =>
      toApplicationIssue({
        issue: toValidationErrorIssue(detail, field),
        classification: { outcome: ROW_OUTCOME.REJECTED },
        rowId,
        ...issueAt
      })
    )
  })
}

/**
 * The rules that compare a linked row with the previous year's (ADR-0060). The
 * field schemas know only that a row was filled in.
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
        return schema
          ? checkTable({ tableName, headers, rows, location, schema, options })
          : []
      }
    )
  )
