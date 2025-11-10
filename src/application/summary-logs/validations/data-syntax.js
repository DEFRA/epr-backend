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
 * Validates data rows using row-level schema validation
 *
 * This validates each row as a complete object, which is more efficient than
 * cell-by-cell validation and enables cross-field validation rules.
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table
 * @param {Array<string>} params.headers - Array of header names
 * @param {Array<Array<*>>} params.rows - Array of data rows
 * @param {Object} params.rowSchema - Pre-compiled Joi object schema for rows
 * @param {Object} params.tableLocation - Table location in spreadsheet
 * @param {Object} params.issues - Validation issues collector
 */
const validateRows = ({
  tableName,
  headers,
  rows,
  rowSchema,
  tableLocation,
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
      for (const detail of error.details) {
        const fieldName = detail.path[0]
        const colIndex = headerToIndexMap.get(fieldName)

        const cellLocation =
          tableLocation?.column && colIndex !== undefined
            ? {
                sheet: tableLocation.sheet,
                row: tableLocation.row + rowIndex + 1,
                column: offsetColumn(tableLocation.column, colIndex)
              }
            : undefined

        issues.addError(
          VALIDATION_CATEGORY.TECHNICAL,
          `Invalid value in column '${fieldName}': ${detail.message}`,
          {
            path: `data.${tableName}.rows[${rowIndex}].${fieldName}`,
            location: cellLocation,
            field: fieldName,
            row: rowIndex + 1, // 1-based for user display
            actual: detail.context.value
          }
        )
      }
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
