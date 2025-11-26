import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import { offsetColumn } from '#common/helpers/spreadsheet/columns.js'
import { isEprMarker } from '#domain/summary-logs/markers.js'
import { getTableSchema } from './table-schemas.js'
import { getRowIdField } from '#domain/summary-logs/table-metadata.js'

/**
 * @typedef {import('#common/validation/validation-issues.js').ValidationIssue} ValidationIssue
 */

/**
 * A validated row with issues attached
 * @typedef {Object} ValidatedRow
 * @property {Array<*>} values - Original row values array
 * @property {string} rowId - Extracted row ID
 * @property {ValidationIssue[]} issues - Validation issues for this row
 */

/**
 * Maps Joi validation error types to application error codes
 *
 * @param {string} joiType - The Joi error type (e.g., 'number.min', 'string.pattern.base')
 * @returns {string} The application error code
 */
const mapJoiTypeToErrorCode = (joiType) => {
  const typeMapping = {
    'any.required': VALIDATION_CODE.FIELD_REQUIRED,
    'number.base': VALIDATION_CODE.INVALID_TYPE,
    'number.min': VALIDATION_CODE.VALUE_OUT_OF_RANGE,
    'number.max': VALIDATION_CODE.VALUE_OUT_OF_RANGE,
    'number.greater': VALIDATION_CODE.VALUE_OUT_OF_RANGE,
    'number.less': VALIDATION_CODE.VALUE_OUT_OF_RANGE,
    'string.base': VALIDATION_CODE.INVALID_TYPE,
    'string.pattern.base': VALIDATION_CODE.INVALID_FORMAT,
    'date.base': VALIDATION_CODE.INVALID_DATE
  }

  /* istanbul ignore next - Defensive fallback for unmapped Joi error types */
  return typeMapping[joiType] || VALIDATION_CODE.VALIDATION_FALLBACK_ERROR
}

/**
 * Validates that required headers are present in the table
 *
 * Missing headers are FATAL because without them we cannot map cell values
 * to their intended columns, making the entire table unprocessable.
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table being validated
 * @param {Array<string|null>} params.headers - Array of header names from the table
 * @param {Array<string>} params.requiredHeaders - Array of required header names
 * @param {Object} params.location - Table location in spreadsheet
 * @param {Object} params.issues - Validation issues collector
 */
const validateHeaders = ({
  tableName,
  headers,
  requiredHeaders,
  location,
  issues
}) => {
  const actualHeaders = headers.filter(
    (header) => header !== null && !isEprMarker(header)
  )

  for (const requiredHeader of requiredHeaders) {
    if (!actualHeaders.includes(requiredHeader)) {
      issues.addFatal(
        VALIDATION_CATEGORY.TECHNICAL,
        `Missing required header '${requiredHeader}' in table '${tableName}'`,
        VALIDATION_CODE.MISSING_REQUIRED_HEADER,
        {
          location,
          expected: requiredHeader,
          actual: actualHeaders
        }
      )
    }
  }
}

/**
 * Creates validation issues for a single row's errors
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table being validated
 * @param {number} params.rowIndex - Zero-based row index
 * @param {import('joi').ValidationError} params.error - Joi validation error object
 * @param {Map<string, number>} params.headerToIndexMap - Map of header names to column indices
 * @param {Object} params.location - Table location in spreadsheet
 * @returns {ValidationIssue[]} Array of validation issues for this row
 */
const createRowIssues = ({
  tableName,
  rowIndex,
  error,
  headerToIndexMap,
  location
}) => {
  const rowIssues = []

  for (const detail of error.details) {
    const fieldName = detail.path[0]
    const colIndex = headerToIndexMap.get(fieldName)

    const cellLocation =
      location?.column && colIndex !== undefined
        ? {
            sheet: location.sheet,
            table: tableName,
            row: location.row + rowIndex + 1,
            column: offsetColumn(location.column, colIndex),
            header: fieldName
          }
        : { table: tableName, header: fieldName }

    rowIssues.push({
      severity: 'error',
      category: VALIDATION_CATEGORY.TECHNICAL,
      message: `Invalid value in column '${fieldName}': ${detail.message}`,
      code: mapJoiTypeToErrorCode(detail.type),
      context: {
        location: cellLocation,
        actual: detail.context.value
      }
    })
  }

  return rowIssues
}

/**
 * Extracts the row ID from a row object based on the table's ID field
 *
 * Only called for tables with schemas, so idField is guaranteed to exist.
 * The row ID value is required by schema validation, so it's guaranteed to be present.
 *
 * @param {Object} rowObject - Row data as object with header keys
 * @param {string} tableName - Name of the table
 * @returns {string} The row ID
 */
const extractRowId = (rowObject, tableName) => {
  const idField = getRowIdField(tableName)
  return String(rowObject[idField])
}

/**
 * Validates data rows and returns validated row structures with issues attached
 *
 * This validates each row as a complete object, which is more efficient than
 * cell-by-cell validation and enables cross-field validation rules.
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table being validated
 * @param {Array<string|null>} params.headers - Array of header names (may include nulls)
 * @param {Array<Array<*>>} params.rows - Array of raw data rows
 * @param {import('joi').ObjectSchema} params.rowSchema - Pre-compiled Joi object schema for rows
 * @param {Object} params.location - Table location in spreadsheet
 * @param {ReturnType<typeof createValidationIssues>} params.issues - Validation issues collector
 * @returns {ValidatedRow[]} Array of validated rows with issues attached
 */
const validateRows = ({
  tableName,
  headers,
  rows,
  rowSchema,
  location,
  issues
}) => {
  const headerToIndexMap = new Map()

  for (const [index, header] of headers.entries()) {
    if (header !== null && !isEprMarker(header)) {
      headerToIndexMap.set(header, index)
    }
  }

  return rows.map((originalRow, rowIndex) => {
    const rowObject = {}

    for (const [headerName, colIndex] of headerToIndexMap) {
      rowObject[headerName] = originalRow[colIndex]
    }

    const { error } = rowSchema.validate(rowObject)

    const rowIssues = error
      ? createRowIssues({
          tableName,
          rowIndex,
          error,
          headerToIndexMap,
          location
        })
      : []

    // Add issues to shared collector for isFatal checks
    for (const issue of rowIssues) {
      issues.addError(issue.category, issue.message, issue.code, issue.context)
    }

    const rowId = extractRowId(rowObject, tableName)
    return {
      values: originalRow,
      rowId,
      issues: rowIssues
    }
  })
}

/**
 * Validates a single table's data syntax and returns validated table data
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table
 * @param {Object} params.tableData - The table data with headers, rows, and location
 * @param {Object} params.schema - The validation schema for this table
 * @param {Object} params.issues - Validation issues collector
 * @returns {Object} Validated table data with rows converted to ValidatedRow[]
 */
const validateTable = ({ tableName, tableData, schema, issues }) => {
  const { headers, rows, location } = tableData
  const { requiredHeaders, rowSchema } = schema

  validateHeaders({
    tableName,
    headers,
    requiredHeaders,
    location,
    issues
  })

  if (issues.isFatal()) {
    return { ...tableData, rows: [] }
  }

  const validatedRows = validateRows({
    tableName,
    headers,
    rows,
    rowSchema,
    location,
    issues
  })

  return {
    ...tableData,
    rows: validatedRows
  }
}

/**
 * @typedef {Object} DataSyntaxValidationResult
 * @property {ReturnType<typeof createValidationIssues>} issues - Validation issues
 * @property {Object} validatedData - Parsed data with rows converted to ValidatedRow[]
 */

/**
 * Validates the syntax of data tables in a summary log
 *
 * Validates each table in parsed.data that has a defined schema:
 * - Checks that required headers are present (FATAL errors - blocks entire table)
 * - Validates each row as a complete object using pre-compiled Joi schemas (ERROR severity)
 * - Reports precise error locations for all validation failures
 *
 * Row-level validation is more efficient than cell-by-cell validation and enables
 * cross-field validation rules (e.g., ensuring related fields have consistent values).
 *
 * Severity levels:
 * - FATAL: Missing required headers prevent processing the entire table
 * - ERROR: Invalid row values mark specific rows as invalid but don't block
 *          submission of the entire spreadsheet - other valid rows can still be processed
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure
 * @returns {DataSyntaxValidationResult} Validation issues and validated data
 */
export const validateDataSyntax = ({ parsed }) => {
  const issues = createValidationIssues()

  const data = parsed?.data || {}
  const validatedTables = {}

  for (const [tableName, tableData] of Object.entries(data)) {
    const schema = getTableSchema(tableName)

    if (!schema) {
      // Keep unvalidated tables as-is
      validatedTables[tableName] = tableData
      continue
    }

    validatedTables[tableName] = validateTable({
      tableName,
      tableData,
      schema,
      issues
    })
  }

  return {
    issues,
    validatedData: {
      ...parsed,
      data: validatedTables
    }
  }
}
