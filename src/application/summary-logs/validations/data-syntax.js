import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { offsetColumn } from '#common/helpers/spreadsheet/columns.js'
import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  isEprMarker,
  SKIP_HEADER_ROW_TEXT
} from '#domain/summary-logs/markers.js'
import { TONNAGE_EXPORT_MESSAGES } from '#domain/summary-logs/table-schemas/exporter/validators/tonnage-export-validator.js'
import { createTableSchemaGetter } from '#domain/summary-logs/table-schemas/index.js'
import { UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES } from '#domain/summary-logs/table-schemas/reprocessor-output/validators/uk-packaging-weight-proportion-validator.js'
import { MESSAGES } from '#domain/summary-logs/table-schemas/shared/joi-messages.js'
import { NET_WEIGHT_MESSAGES } from '#domain/summary-logs/table-schemas/shared/validators/net-weight-validator.js'
import {
  classifyRow,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/** @import {ValidatedSummaryLog, ValidatedTableSection} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationCode} from '#common/enums/validation.js' */
/** @import {ValidationIssue, ValidationIssueLocation, ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {CellLocation, DataSection, ParsedSummaryLog} from '#domain/summary-logs/extractor/port.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */
/** @import {RowClassificationIssue, RowOutcome} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

/**
 * A validated row from the data syntax validation pipeline
 *
 * All fields are required - this is the output of validation, not the input.
 *
 * @export
 * @typedef {Object} ValidatedRow
 * @property {Record<string, any>} data - Row data as object keyed by header name
 * @property {string} rowId - Extracted row ID
 * @property {RowOutcome} outcome - Classification outcome from validation pipeline
 * @property {ValidationIssue[]} issues - Validation issues for this row (empty array if none)
 */

/**
 * Joi error type to application error code mapping.
 *
 * When adding new Joi validators to table schemas, ensure the error types
 * they produce are mapped here. Unmapped types will throw an error.
 *
 * @type {Readonly<Record<string, ValidationCode>>}
 */
const JOI_TYPE_TO_ERROR_CODE = Object.freeze({
  'any.required': VALIDATION_CODE.FIELD_REQUIRED,
  'any.only': VALIDATION_CODE.INVALID_TYPE,
  'number.base': VALIDATION_CODE.INVALID_TYPE,
  'number.min': VALIDATION_CODE.VALUE_OUT_OF_RANGE,
  'number.max': VALIDATION_CODE.VALUE_OUT_OF_RANGE,
  'number.greater': VALIDATION_CODE.VALUE_OUT_OF_RANGE,
  'number.less': VALIDATION_CODE.VALUE_OUT_OF_RANGE,
  'number.integer': VALIDATION_CODE.INVALID_TYPE,
  'string.base': VALIDATION_CODE.INVALID_TYPE,
  'string.pattern.base': VALIDATION_CODE.INVALID_FORMAT,
  'string.max': VALIDATION_CODE.VALUE_OUT_OF_RANGE,
  'date.base': VALIDATION_CODE.INVALID_DATE,
  'date.min': VALIDATION_CODE.INVALID_DATE,
  'date.max': VALIDATION_CODE.INVALID_DATE,
  'any.calendarDate': VALIDATION_CODE.INVALID_DATE,
  'string.threeDigitId': VALIDATION_CODE.INVALID_TYPE,
  'custom.netWeightCalculationMismatch':
    VALIDATION_CODE.CALCULATED_VALUE_MISMATCH,
  'custom.tonnageCalculationMismatch':
    VALIDATION_CODE.CALCULATED_VALUE_MISMATCH,
  'custom.ukPackagingProportionCalculationMismatch':
    VALIDATION_CODE.CALCULATED_VALUE_MISMATCH
})

/**
 * Maps Joi validation error types to application error codes.
 *
 * @param {string} joiType - The Joi error type (e.g., 'number.min', 'string.pattern.base')
 * @returns {ValidationCode} The application error code
 * @throws {Error} If the Joi error type is not mapped
 */
const mapJoiTypeToErrorCode = (joiType) => {
  const code = JOI_TYPE_TO_ERROR_CODE[joiType]
  if (!code) {
    throw new Error(
      `Unmapped Joi error type '${joiType}'. Add it to JOI_TYPE_TO_ERROR_CODE in data-syntax.js`
    )
  }
  return code
}

/** @type {Readonly<Record<string, ValidationCode>>} */
export const JOI_MESSAGE_TO_ERROR_CODE = Object.freeze({
  [MESSAGES.MUST_BE_A_NUMBER]: VALIDATION_CODE.MUST_BE_A_NUMBER,
  [MESSAGES.MUST_BE_A_STRING]: VALIDATION_CODE.MUST_BE_A_STRING,
  [MESSAGES.MUST_BE_A_VALID_DATE]: VALIDATION_CODE.MUST_BE_A_VALID_DATE,
  [MESSAGES.MUST_BE_GREATER_THAN_ZERO]:
    VALIDATION_CODE.MUST_BE_GREATER_THAN_ZERO,
  [MESSAGES.MUST_BE_AT_LEAST_ZERO]: VALIDATION_CODE.MUST_BE_AT_LEAST_ZERO,
  [MESSAGES.MUST_BE_AT_MOST_1]: VALIDATION_CODE.MUST_BE_AT_MOST_1,
  [MESSAGES.MUST_BE_LESS_THAN_ONE]: VALIDATION_CODE.MUST_BE_LESS_THAN_1,
  [MESSAGES.MUST_BE_AT_MOST_1000]: VALIDATION_CODE.MUST_BE_AT_MOST_1000,
  [MESSAGES.MUST_BE_AT_MOST_100_CHARS]:
    VALIDATION_CODE.MUST_BE_AT_MOST_100_CHARS,
  [MESSAGES.MUST_BE_YES_OR_NO]: VALIDATION_CODE.MUST_BE_YES_OR_NO,
  [MESSAGES.MUST_CONTAIN_ONLY_PERMITTED_CHARACTERS]:
    VALIDATION_CODE.MUST_CONTAIN_ONLY_PERMITTED_CHARACTERS,
  [MESSAGES.MUST_BE_3_DIGIT_ID]: VALIDATION_CODE.MUST_BE_3_DIGIT_ID,
  [MESSAGES.MUST_BE_VALID_EWC_CODE]: VALIDATION_CODE.MUST_BE_VALID_EWC_CODE,
  [MESSAGES.MUST_BE_VALID_RECYCLABLE_PROPORTION_METHOD]:
    VALIDATION_CODE.MUST_BE_VALID_RECYCLABLE_PROPORTION_METHOD,
  [MESSAGES.MUST_BE_VALID_WASTE_DESCRIPTION]:
    VALIDATION_CODE.MUST_BE_VALID_WASTE_DESCRIPTION,
  [MESSAGES.MUST_BE_VALID_BASEL_CODE]: VALIDATION_CODE.MUST_BE_VALID_BASEL_CODE,
  [MESSAGES.MUST_BE_VALID_EXPORT_CONTROL]:
    VALIDATION_CODE.MUST_BE_VALID_EXPORT_CONTROL,
  [NET_WEIGHT_MESSAGES['custom.netWeightCalculationMismatch']]:
    VALIDATION_CODE.NET_WEIGHT_CALCULATION_MISMATCH,
  [TONNAGE_EXPORT_MESSAGES['custom.tonnageCalculationMismatch']]:
    VALIDATION_CODE.TONNAGE_CALCULATION_MISMATCH,
  [UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES[
    'custom.ukPackagingProportionCalculationMismatch'
  ]]: VALIDATION_CODE.UK_PACKAGING_PROPORTION_CALCULATION_MISMATCH
})

/**
 * Maps a Joi failure message to a specific application error code, or
 * undefined if the message isn't recognised.
 *
 * @param {string} message
 * @returns {ValidationCode | undefined}
 */
const mapMessageToErrorCode = (message) => JOI_MESSAGE_TO_ERROR_CODE[message]

/**
 * @param {ValidationIssue[]} issues
 * @returns {boolean} True if any issue is fatal
 */
const hasFatal = (issues) =>
  issues.some((issue) => issue.severity === VALIDATION_SEVERITY.FATAL)

/**
 * Builds a map from header names to their column indices
 *
 * Filters out null headers and EPR markers, returning only valid data headers.
 *
 * @param {Array<string|null>} headers - Array of header names from the table
 * @returns {Map<string, number>} Map of header name to column index
 */
const buildHeaderToIndexMap = (headers) => {
  const headerToIndexMap = new Map()

  for (const [index, header] of headers.entries()) {
    if (header !== null && !isEprMarker(header)) {
      headerToIndexMap.set(header, index)
    }
  }

  return headerToIndexMap
}

/**
 * Validates that required headers are present in the table.
 *
 * Missing headers are FATAL because without them we cannot map cell values
 * to their intended columns, making the entire table unprocessable.
 *
 * @param {{
 *   tableName: string,
 *   headers: Array<string | null>,
 *   requiredHeaders: string[],
 *   location: CellLocation
 * }} params
 * @returns {ValidationIssue[]} A fatal issue for each missing required header
 */
const validateHeaders = ({ tableName, headers, requiredHeaders, location }) => {
  const actualHeaders = headers.filter(
    (header) => header !== null && !isEprMarker(header)
  )

  return requiredHeaders
    .filter((requiredHeader) => !actualHeaders.includes(requiredHeader))
    .map((requiredHeader) => ({
      severity: VALIDATION_SEVERITY.FATAL,
      category: VALIDATION_CATEGORY.TECHNICAL,
      message: `Missing required header '${requiredHeader}' in table '${tableName}'`,
      code: VALIDATION_CODE.HEADER_REQUIRED,
      context: { location, expected: requiredHeader, actual: actualHeaders }
    }))
}

/**
 * Builds cell location for error reporting.
 *
 * @param {{
 *   tableName: string,
 *   rowNumber: number,
 *   rowId: string,
 *   fieldName: string,
 *   colIndex: number | undefined,
 *   location: CellLocation
 * }} params
 * @returns {ValidationIssueLocation}
 */
const buildCellLocation = ({
  tableName,
  rowNumber,
  rowId,
  fieldName,
  colIndex,
  location
}) =>
  location?.column && colIndex !== undefined
    ? {
        sheet: location.sheet,
        table: tableName,
        row: rowNumber,
        rowId,
        column: offsetColumn(location.column, colIndex),
        header: fieldName
      }
    : { table: tableName, rowId, header: fieldName }

/**
 * Maps a row-classification issue from the validation pipeline into a
 * domain-level ValidationIssue (with our category/severity/code/context shape).
 *
 * @param {{
 *   issue: RowClassificationIssue,
 *   classification: { outcome: RowOutcome },
 *   headerToIndexMap: Map<string, number>,
 *   rowObject: Record<string, unknown>,
 *   rowId: string,
 *   tableName: string,
 *   rowNumber: number,
 *   location: CellLocation
 * }} params
 * @returns {ValidationIssue}
 */
const toApplicationIssue = ({
  issue,
  classification,
  headerToIndexMap,
  rowObject,
  rowId,
  tableName,
  rowNumber,
  location
}) => {
  const fieldName = String(issue.field)
  const colIndex = headerToIndexMap.get(fieldName)
  const isValidationError = issue.code === 'VALIDATION_ERROR'

  const message = issue.message
    ? `Invalid value in column '${fieldName}': ${issue.message}`
    : `Missing required field: ${fieldName}`

  const code = isValidationError
    ? mapJoiTypeToErrorCode(issue.type)
    : VALIDATION_CODE.FIELD_REQUIRED

  const errorCode = isValidationError
    ? mapMessageToErrorCode(issue.message)
    : undefined

  const isFatal = classification.outcome === ROW_OUTCOME.REJECTED

  const context = {
    location: buildCellLocation({
      tableName,
      rowNumber,
      rowId,
      fieldName,
      colIndex,
      location
    }),
    actual: rowObject[fieldName],
    ...(errorCode && { errorCode })
  }

  return {
    category: VALIDATION_CATEGORY.TECHNICAL,
    severity: isFatal ? VALIDATION_SEVERITY.FATAL : VALIDATION_SEVERITY.ERROR,
    message,
    code,
    context
  }
}

/**
 * Checks whether a row should be filtered out before validation.
 *
 * Rows are filtered when the row ID field contains template artefacts
 * rather than real data: user-facing header description rows or
 * pre-populated empty template rows.
 *
 * @param {Record<string, unknown>} rowObject - Row data keyed by header name
 * @param {string} rowIdField - Name of the row ID field
 * @returns {boolean} True if the row should be excluded from validation
 */
const isTemplateRow = (rowObject, rowIdField) => {
  const rowIdValue = rowObject[rowIdField]

  if (
    typeof rowIdValue === 'string' &&
    rowIdValue.startsWith(SKIP_HEADER_ROW_TEXT)
  ) {
    return true
  }

  if (rowIdValue === null || rowIdValue === undefined) {
    return true
  }

  return false
}

/**
 * Validates all rows using the classifyRow pipeline.
 *
 * Each row is classified as:
 * - REJECTED: Fails VAL010 (in-sheet validation) - produces FATAL errors
 * - EXCLUDED: Fails VAL011 (missing required fields) - produces ERROR severity
 * - INCLUDED: Passes all validation
 *
 * @param {{
 *   tableName: string,
 *   headerToIndexMap: Map<string, number>,
 *   rows: Array<{ rowNumber: number, values: Array<unknown> }>,
 *   domainSchema: TableSchema,
 *   location: CellLocation
 * }} params
 * @returns {{ issues: ValidationIssue[], rows: ValidatedRow[] }}
 */
const validateRows = ({
  tableName,
  headerToIndexMap,
  rows,
  domainSchema,
  location
}) => {
  const validatedRows = rows.flatMap(({ rowNumber, values }) => {
    /** @type {Record<string, unknown>} */
    const rowObject = {}
    for (const [headerName, colIndex] of headerToIndexMap) {
      rowObject[headerName] = values[colIndex]
    }

    if (isTemplateRow(rowObject, domainSchema.rowIdField)) {
      return []
    }

    const classification = classifyRow(rowObject, domainSchema)
    const rowId = String(rowObject[domainSchema.rowIdField]) // NOSONAR: javascript:S6551 - ROW_ID is never an object

    const rowIssues = classification.issues.map((issue) =>
      toApplicationIssue({
        issue,
        classification,
        headerToIndexMap,
        rowObject,
        rowId,
        tableName,
        rowNumber,
        location
      })
    )

    return [
      {
        data: rowObject,
        rowId,
        outcome: classification.outcome,
        issues: rowIssues
      }
    ]
  })

  return {
    issues: validatedRows.flatMap((row) => row.issues),
    rows: validatedRows
  }
}

/**
 * Validates a single table's data syntax and returns validated table data.
 *
 * @param {{
 *   tableName: string,
 *   tableData: DataSection,
 *   domainSchema: TableSchema
 * }} params
 * @returns {{ issues: ValidationIssue[], table: ValidatedTableSection }} Validated table data (rows as ValidatedRow[]) and the issues it produced
 */
const validateTable = ({ tableName, tableData, domainSchema }) => {
  const { headers, rows, location } = tableData

  const headerIssues = validateHeaders({
    tableName,
    headers,
    requiredHeaders: domainSchema.requiredHeaders,
    location
  })

  if (hasFatal(headerIssues)) {
    return { table: { ...tableData, rows: [] }, issues: headerIssues }
  }

  const headerToIndexMap = buildHeaderToIndexMap(headers)

  const { rows: validatedRows, issues: rowIssues } = validateRows({
    tableName,
    headerToIndexMap,
    rows,
    domainSchema,
    location
  })

  return {
    table: {
      ...tableData,
      rows: hasFatal(rowIssues) ? [] : validatedRows
    },
    issues: [...headerIssues, ...rowIssues]
  }
}

/**
 * @typedef {Object} DataSyntaxValidationResult
 * @property {ValidationIssuesCollector} issues - Validation issues
 * @property {ValidatedSummaryLog} validatedData - Parsed data with rows converted to ValidatedRow[]
 */

/**
 * Creates a data syntax validator bound to a specific schema registry
 *
 * Validates each table in parsed.data that has a defined schema for the processing type:
 * - Checks that required headers are present (FATAL errors - blocks entire table)
 * - Validates each row as a complete object using pre-compiled Joi schemas
 * - Reports precise error locations for all validation failures
 *
 * Row-level validation is more efficient than cell-by-cell validation and enables
 * cross-field validation rules (e.g. ensuring related fields have consistent values).
 *
 * Severity levels:
 * - FATAL: Missing required headers prevent processing the entire table
 * - FATAL: Invalid row values on REJECTED rows block submission entirely
 *
 * @param {Object} schemaRegistry - Schema registry mapping processing types to table schemas
 * @returns {(parsed: ParsedSummaryLog) => DataSyntaxValidationResult} Validator function that takes parsed summary log
 */
export const createDataSyntaxValidator = (schemaRegistry) => (parsed) => {
  const data = parsed?.data || {}
  const processingType = parsed?.meta?.PROCESSING_TYPE?.value
  const getTableSchema = createTableSchemaGetter(processingType, schemaRegistry)
  /** @type {ValidatedSummaryLog['data']} */
  const validatedTables = {}
  /** @type {ValidationIssue[]} */
  const allIssues = []

  for (const [tableName, tableData] of Object.entries(data)) {
    const domainSchema = getTableSchema(tableName)

    if (!domainSchema) {
      const location = tableData.location
        ? { sheet: tableData.location.sheet, table: tableName }
        : { table: tableName }

      allIssues.push({
        severity: VALIDATION_SEVERITY.FATAL,
        category: VALIDATION_CATEGORY.TECHNICAL,
        message: `Unrecognised table '${tableName}' has no schema for this processing type`,
        code: VALIDATION_CODE.TABLE_UNRECOGNISED,
        context: { location }
      })

      // Keep unvalidated tables as-is for downstream processing.
      validatedTables[tableName] = /** @type {ValidatedTableSection} */ (
        /** @type {unknown} */ (tableData)
      )
      continue
    }

    const { issues: tableIssues, table } = validateTable({
      tableName,
      tableData,
      domainSchema
    })

    validatedTables[tableName] = table
    allIssues.push(...tableIssues)
  }

  return {
    issues: createValidationIssues(allIssues),
    validatedData: {
      ...parsed,
      data: validatedTables
    }
  }
}
