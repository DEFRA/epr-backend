import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import { offsetColumn } from '#common/helpers/spreadsheet/columns.js'
import { isEprMarker } from '#domain/summary-logs/markers.js'
import { getTableSchema } from './table-schemas.js'

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
 * Processes validation errors for a single row
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table being validated
 * @param {number} params.rowIndex - Zero-based row index
 * @param {Object} params.error - Joi validation error object
 * @param {Map} params.headerToIndexMap - Map of header names to column indices
 * @param {Object} params.location - Table location in spreadsheet
 * @param {Object} params.issues - Validation issues collector
 */
const processRowErrors = ({
  tableName,
  rowIndex,
  error,
  headerToIndexMap,
  location,
  issues
}) => {
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

    issues.addError(
      VALIDATION_CATEGORY.TECHNICAL,
      `Invalid value in column '${fieldName}': ${detail.message}`,
      mapJoiTypeToErrorCode(detail.type),
      {
        location: cellLocation,
        actual: detail.context.value
      }
    )
  }
}

/**
 * Validates data rows using row-level schema validation
 *
 * This validates each row as a complete object, which is more efficient than
 * cell-by-cell validation and enables cross-field validation rules.
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table being validated
 * @param {Array<string>} params.headers - Array of header names
 * @param {Array<Array<*>>} params.rows - Array of data rows
 * @param {Object} params.rowSchema - Pre-compiled Joi object schema for rows
 * @param {Object} params.location - Table location in spreadsheet
 * @param {Object} params.issues - Validation issues collector
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

  for (const [rowIndex, row] of rows.entries()) {
    const rowObject = {}

    for (const [headerName, colIndex] of headerToIndexMap) {
      rowObject[headerName] = row[colIndex]
    }

    const { error } = rowSchema.validate(rowObject)

    if (error) {
      processRowErrors({
        tableName,
        rowIndex,
        error,
        headerToIndexMap,
        location,
        issues
      })
    }
  }
}

/**
 * Validates a single table's data syntax
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table
 * @param {Object} params.tableData - The table data with headers, rows, and location
 * @param {Object} params.schema - The validation schema for this table
 * @param {Object} params.issues - Validation issues collector
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

  if (!issues.isFatal()) {
    validateRows({
      tableName,
      headers,
      rows,
      rowSchema,
      location,
      issues
    })
  }
}

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
 * @returns {Object} Validation issues object
 */
export const validateDataSyntax = ({ parsed }) => {
  const issues = createValidationIssues()

  const data = parsed?.data || {}

  for (const [tableName, tableData] of Object.entries(data)) {
    const schema = getTableSchema(tableName)

    if (!schema) {
      continue
    }

    validateTable({
      tableName,
      tableData,
      schema,
      issues
    })
  }

  return issues
}
