import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { previousYear } from '#common/helpers/dates/year.js'
import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  isBeforeCorrectionDeadline,
  lastCorrectionDay
} from '#domain/summary-logs/correction-deadline.js'
import { isHeaderDescriptionRow } from '#domain/summary-logs/markers.js'
import {
  PREVIOUS_YEAR_LINK_STATUS,
  PREVIOUS_YEAR_ROW_COMPLETION
} from '#domain/summary-logs/previous-year-link.js'
import { BEFORE_SUMMARY_LOG_YEAR_ERROR } from '#domain/summary-logs/table-schemas/shared/field-schemas.js'
import { toRowId } from '#domain/summary-logs/table-schemas/shared/row-id.schema.js'
import {
  isFilled,
  ROW_OUTCOME,
  toValidationErrorIssue
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import {
  buildCellLocation,
  buildHeaderToIndexMap,
  toApplicationIssue
} from './data-syntax.js'

/** @import {Schema} from 'joi' */
/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */
/** @import {ValidationIssue, ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {CellLocation, ParsedSummaryLog} from '#domain/summary-logs/extractor/port.js' */
/** @import {TableSchema, YearLinking} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {SummaryLogValidationOptions} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import {FilledInRow, FoundPreviousYearLink, NotFoundPreviousYearLink, PreviousYearLink} from '../fill-in-linked-rows.js' */

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
 *   columnSchemas: Map<string, Schema>,
 *   options: SummaryLogValidationOptions,
 *   issueLocation: RowIssueLocation
 * }} LinkedRowContext
 */

/** @typedef {(context: LinkedRowContext<FoundPreviousYearLink>) => ValidationIssue[]} FoundLinkRule */

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
 *   errorCode: string,
 *   field: string,
 *   context: LinkedRowContext<PreviousYearLink>,
 *   actual: unknown,
 *   previousYearRowId?: string,
 *   deadline?: CalendarDate
 * }} params
 * @returns {ValidationIssue}
 */
const toPreviousYearLinkIssue = ({
  errorCode,
  field,
  context,
  actual,
  previousYearRowId,
  deadline
}) => {
  const { headerToIndexMap, tableName, rowNumber, location } =
    context.issueLocation
  return {
    category: VALIDATION_CATEGORY.BUSINESS,
    severity: VALIDATION_SEVERITY.FATAL,
    message: `Previous year link ${errorCode} in column '${field}'`,
    code: VALIDATION_CODE.PREVIOUS_YEAR_LINK,
    context: {
      location: buildCellLocation({
        tableName,
        rowNumber,
        rowId: context.rowId,
        fieldName: field,
        colIndex: headerToIndexMap.get(field),
        location
      }),
      actual,
      expected: previousYear(context.options.summaryLogYear),
      errorCode,
      ...(previousYearRowId && { previousYearRowId }),
      ...(deadline && { deadline })
    }
  }
}

/** @type {FoundLinkRule} */
const earlierYearDates = (context) => {
  const { rowObject, rowId, previousYearLink, columnSchemas, options } = context
  return previousYearLink.link.suppliedFields.flatMap((field) => {
    const schema = columnSchemas.get(field)
    const value = rowObject[field]
    if (
      schema === undefined ||
      coerced(schema, value) ===
        coerced(schema, previousYearLink.previousYear[field])
    ) {
      return []
    }
    const { error } = schema.validate(value, { context: options })
    return (error?.details ?? [])
      .filter(({ type }) => type === BEFORE_SUMMARY_LOG_YEAR_ERROR)
      .map((detail) =>
        toApplicationIssue({
          issue: toValidationErrorIssue(detail, field),
          classification: { outcome: ROW_OUTCOME.REJECTED },
          rowId,
          ...context.issueLocation
        })
      )
  })
}

/**
 * A previous year row ID the data syntax check rejects gets only that error.
 *
 * @param {LinkedRowContext<NotFoundPreviousYearLink>} context
 * @returns {ValidationIssue[]}
 */
const previousYearRowNotFound = (context) => {
  const field = context.linking.previousYearRowIdField
  const isWellFormed =
    context.columnSchemas
      .get(field)
      ?.validate(context.rowObject[field], { context: context.options })
      .error === undefined
  return isWellFormed
    ? [
        toPreviousYearLinkIssue({
          errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_NOT_FOUND,
          field,
          context,
          actual: context.rowObject[field]
        })
      ]
    : []
}

const COMPLETION_ERROR_CODES = Object.freeze({
  [PREVIOUS_YEAR_ROW_COMPLETION.RECEIVED_BY_OSR]:
    VALIDATION_CODE.PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR,
  [PREVIOUS_YEAR_ROW_COMPLETION.REPATRIATED]:
    VALIDATION_CODE.PREVIOUS_YEAR_ROW_REPATRIATED
})

/**
 * What the operator entered in the cell, not the previous year's value fill-in
 * put there.
 *
 * @param {LinkedRowContext<FoundPreviousYearLink>} context
 * @param {string} field
 * @returns {unknown}
 */
const enteredValueOf = ({ rowObject, previousYearLink }, field) =>
  previousYearLink.link.suppliedFields.includes(field) ? rowObject[field] : null

/** @type {FoundLinkRule} */
const previousYearRowComplete = (context) => {
  const { previousYearLink, linking } = context
  return linking
    .completionsOf(previousYearLink.previousYear, previousYearLink.link.year)
    .map(({ completion, field }) =>
      toPreviousYearLinkIssue({
        errorCode: COMPLETION_ERROR_CODES[completion],
        field,
        context,
        actual: enteredValueOf(context, field),
        previousYearRowId: previousYearLink.link.rowId
      })
    )
}

/** @type {FoundLinkRule} */
const previousYearRowMissingData = (context) => {
  const { previousYearLink, linking, options } = context
  const { year, rowId } = previousYearLink.link
  if (!isBeforeCorrectionDeadline(year, options, options.createdAt)) {
    return []
  }
  const deadline = lastCorrectionDay(year, options)
  return linking.missingFieldsOf(previousYearLink.previousYear).map((field) =>
    toPreviousYearLinkIssue({
      errorCode: VALIDATION_CODE.PREVIOUS_YEAR_ROW_MISSING_DATA,
      field,
      context,
      actual: previousYearLink.previousYear[field],
      previousYearRowId: rowId,
      deadline
    })
  )
}

/** @type {readonly FoundLinkRule[]} */
const FOUND_LINK_RULES = Object.freeze([
  earlierYearDates,
  previousYearRowComplete,
  previousYearRowMissingData
])

/**
 * @param {{
 *   tableName: string,
 *   headers: Array<string | null>,
 *   rows: FilledInRow[],
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

  return rows.flatMap(({ rowNumber, values, previousYearLink }) => {
    if (previousYearLink === undefined) {
      return []
    }
    /** @type {Record<string, unknown>} */
    const rowObject = {}
    for (const [header, index] of headerToIndexMap) {
      rowObject[header] = values[index]
    }
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
                code: 'MISSING_REQUIRED_FIELD',
                field: schema.rowIdField
              },
              classification: { outcome: ROW_OUTCOME.REJECTED },
              ...issueLocation
            })
          ]
        : []
    }

    const rowContext = {
      rowObject,
      rowId: toRowId(rowIdValue),
      linking,
      columnSchemas,
      options,
      issueLocation
    }
    return previousYearLink.status === PREVIOUS_YEAR_LINK_STATUS.FOUND
      ? FOUND_LINK_RULES.flatMap((rule) =>
          rule({ ...rowContext, previousYearLink })
        )
      : previousYearRowNotFound({ ...rowContext, previousYearLink })
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
