import {
  createValidationIssues,
  VALIDATION_CATEGORY
} from '#common/validation/validation-issues.js'
import { offsetColumn } from '#common/helpers/spreadsheet/columns.js'
import { isEprMarker } from '#domain/summary-logs/markers.js'
import { getTableSchema } from './table-schemas.js'

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
        {
          path: `data.${tableName}.headers`,
          location,
          field: requiredHeader,
          expected: requiredHeader,
          actual: actualHeaders
        }
      )
    }
  }
}

/**
 * Validates a single cell value against its column schema
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table
 * @param {string} params.headerName - Name of the column/header
 * @param {*} params.cellValue - The cell value to validate
 * @param {number} params.rowIndex - Zero-based row index
 * @param {number} params.colIndex - Zero-based column index
 * @param {Object} params.tableLocation - Table origin location in spreadsheet
 * @param {Object} params.columnSchema - Joi schema for the column
 * @param {Object} params.issues - Validation issues collector
 */
const validateCell = ({
  tableName,
  headerName,
  cellValue,
  rowIndex,
  colIndex,
  tableLocation,
  columnSchema,
  issues
}) => {
  const { error } = columnSchema.validate(cellValue)

  if (error) {
    const cellLocation = tableLocation?.column
      ? {
          sheet: tableLocation.sheet,
          row: tableLocation.row + rowIndex + 1,
          column: offsetColumn(tableLocation.column, colIndex)
        }
      : undefined

    issues.addError(
      VALIDATION_CATEGORY.TECHNICAL,
      `Invalid value in column '${headerName}': ${error.message}`,
      {
        path: `data.${tableName}.rows[${rowIndex}].${headerName}`,
        location: cellLocation,
        field: headerName,
        row: rowIndex + 1, // 1-based for user display
        actual: cellValue
      }
    )
  }
}

/**
 * Validates data rows against column schemas
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table
 * @param {Array<string>} params.headers - Array of header names
 * @param {Array<Array<*>>} params.rows - Array of data rows
 * @param {Object} params.columnValidation - Map of header name -> Joi schema
 * @param {Object} params.tableLocation - Table location in spreadsheet
 * @param {Object} params.issues - Validation issues collector
 */
const validateRows = ({
  tableName,
  headers,
  rows,
  columnValidation,
  tableLocation,
  issues
}) => {
  const headerToIndexMap = new Map()

  headers.forEach((header, index) => {
    if (header !== null && columnValidation[header]) {
      headerToIndexMap.set(header, index)
    }
  })

  rows.forEach((row, rowIndex) => {
    headerToIndexMap.forEach((colIndex, headerName) => {
      const cellValue = row[colIndex]
      const columnSchema = columnValidation[headerName]

      validateCell({
        tableName,
        headerName,
        cellValue,
        rowIndex,
        colIndex,
        tableLocation,
        columnSchema,
        issues
      })
    })
  })
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
  const { requiredHeaders, columnValidation } = schema

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
      columnValidation,
      tableLocation: location,
      issues
    })
  }
}

/**
 * Validates the syntax of data tables in a summary log
 *
 * Validates each table in parsed.data that has a defined schema:
 * - Checks that required headers are present (FATAL errors - blocks entire table)
 * - Validates each cell value against its column's Joi schema (ERROR severity - row-level issues)
 * - Reports precise error locations
 *
 * Severity levels:
 * - FATAL: Missing required headers prevent processing the entire table
 * - ERROR: Invalid cell values mark specific rows as invalid but don't block
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
