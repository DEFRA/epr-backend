import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import { offsetColumn } from '#common/helpers/spreadsheet/columns.js'
import { isEprMarker } from '#domain/summary-logs/markers.js'
import {
  classifyRow,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/**
 * Creates a table schema getter bound to a specific processing type
 *
 * @param {string} processingType - The processing type from meta.PROCESSING_TYPE
 * @param {Object} registry - Schema registry mapping processing types to table schemas
 * @returns {function(string): Object|null} A function that takes a table name and returns its schema
 */
const createTableSchemaGetter = (processingType, registry) => {
  const tables = registry[processingType]
  return (tableName) => tables?.[tableName] || null
}

/**
 * @typedef {import('#common/validation/validation-issues.js').ValidationIssue} ValidationIssue
 */

/**
 * A validated row with classification outcome and issues attached
 *
 * @export
 * @typedef {Object} ValidatedRow
 * @property {Array<*>} values - Original row values array
 * @property {string} rowId - Extracted row ID
 * @property {'REJECTED'|'EXCLUDED'|'INCLUDED'} outcome - Classification outcome from validation pipeline
 * @property {ValidationIssue[]} issues - Validation issues for this row
 */

/**
 * Adapts domain table schema to the structure expected by validateTable
 *
 * Domain schemas use: unfilledValues, validationSchema, fieldsRequiredForWasteBalance
 * This adapter extracts what validateTable needs during the migration.
 *
 * @param {Object} domainSchema - Schema from domain layer
 * @returns {Object} Schema structure for validateTable
 */
const adaptDomainSchema = (domainSchema) => ({
  requiredHeaders: domainSchema.requiredHeaders,
  rowIdField: domainSchema.rowIdField,
  domainSchema
})

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
        VALIDATION_CODE.HEADER_REQUIRED,
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
 * Builds cell location for error reporting
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table
 * @param {number} params.rowIndex - Zero-based row index
 * @param {string} params.fieldName - Name of the field with the error
 * @param {number|undefined} params.colIndex - Column index for the field
 * @param {Object} params.location - Table location in spreadsheet
 * @returns {Object} Cell location object
 */
const buildCellLocation = ({
  tableName,
  rowIndex,
  fieldName,
  colIndex,
  location
}) =>
  location?.column && colIndex !== undefined
    ? {
        sheet: location.sheet,
        table: tableName,
        row: location.row + rowIndex + 1,
        column: offsetColumn(location.column, colIndex),
        header: fieldName
      }
    : { table: tableName, header: fieldName }

/**
 * Validates all rows using the classifyRow pipeline
 *
 * Each row is classified as:
 * - REJECTED: Fails VAL010 (in-sheet validation) - produces FATAL errors
 * - EXCLUDED: Fails VAL011 (missing required fields) - produces ERROR severity
 * - INCLUDED: Passes all validation
 *
 * @param {Object} params
 * @param {string} params.tableName - Name of the table being validated
 * @param {Map<string, number>} params.headerToIndexMap - Map of header names to column indices
 * @param {Array<Array<*>>} params.rows - Array of raw data rows
 * @param {Object} params.domainSchema - Domain table schema with unfilledValues, validationSchema, fieldsRequiredForWasteBalance
 * @param {Object} params.location - Table location in spreadsheet
 * @param {ReturnType<typeof createValidationIssues>} params.issues - Validation issues collector
 * @returns {ValidatedRow[]} Array of validated rows with outcome and issues attached
 */
const validateRows = ({
  tableName,
  headerToIndexMap,
  rows,
  domainSchema,
  location,
  issues
}) => {
  return rows.map((originalRow, rowIndex) => {
    // Build row object from array
    const rowObject = {}
    for (const [headerName, colIndex] of headerToIndexMap) {
      rowObject[headerName] = originalRow[colIndex]
    }

    // Classify row using domain pipeline
    const classification = classifyRow(rowObject, domainSchema)

    // Convert classification issues to application issues with locations
    const rowIssues = classification.issues.map((issue) => {
      const colIndex = headerToIndexMap.get(issue.field)
      const message = issue.message
        ? `Invalid value in column '${issue.field}': ${issue.message}`
        : `Missing required field: ${issue.field}`

      // Map issue code to application error code
      // Domain layer only produces VALIDATION_ERROR or MISSING_REQUIRED_FIELD
      const code =
        issue.code === 'VALIDATION_ERROR'
          ? mapJoiTypeToErrorCode(issue.type)
          : VALIDATION_CODE.FIELD_REQUIRED

      return {
        category: VALIDATION_CATEGORY.TECHNICAL,
        message,
        code,
        context: {
          location: buildCellLocation({
            tableName,
            rowIndex,
            fieldName: issue.field,
            colIndex,
            location
          }),
          actual: rowObject[issue.field]
        }
      }
    })

    // Record issues at appropriate severity
    // Only ROW_ID validation errors are FATAL (block entire submission)
    // Other validation errors are ERROR (mark row as invalid but don't block submission)
    for (const rowIssue of rowIssues) {
      const isRowIdError =
        classification.outcome === ROW_OUTCOME.REJECTED &&
        rowIssue.context.location.header === domainSchema.rowIdField

      if (isRowIdError) {
        issues.addFatal(
          rowIssue.category,
          rowIssue.message,
          rowIssue.code,
          rowIssue.context
        )
      } else {
        issues.addError(
          rowIssue.category,
          rowIssue.message,
          rowIssue.code,
          rowIssue.context
        )
      }
    }

    const rowId = String(rowObject[domainSchema.rowIdField])

    return {
      values: originalRow,
      rowId,
      outcome: classification.outcome,
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
 * @param {Object} params.schema - The adapted validation schema for this table
 * @param {Object} params.issues - Validation issues collector
 * @returns {Object} Validated table data with rows converted to ValidatedRow[]
 */
const validateTable = ({ tableName, tableData, schema, issues }) => {
  const { headers, rows, location } = tableData
  const { requiredHeaders, domainSchema } = schema

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

  const headerToIndexMap = buildHeaderToIndexMap(headers)

  const validatedRows = validateRows({
    tableName,
    headerToIndexMap,
    rows,
    domainSchema,
    location,
    issues
  })

  if (issues.isFatal()) {
    return { ...tableData, rows: [] }
  }

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
 * Creates a data syntax validator bound to a specific schema registry
 *
 * Validates each table in parsed.data that has a defined schema for the processing type:
 * - Checks that required headers are present (FATAL errors - blocks entire table)
 * - Validates each row as a complete object using pre-compiled Joi schemas (ERROR severity)
 * - Reports precise error locations for all validation failures
 *
 * Row-level validation is more efficient than cell-by-cell validation and enables
 * cross-field validation rules (e.g. ensuring related fields have consistent values).
 *
 * Severity levels:
 * - FATAL: Missing required headers prevent processing the entire table
 * - ERROR: Invalid row values mark specific rows as invalid but don't block
 *          submission of the entire spreadsheet - other valid rows can still be processed
 *
 * @param {Object} schemaRegistry - Schema registry mapping processing types to table schemas
 * @returns {function(Object): DataSyntaxValidationResult} Validator function that takes parsed summary log
 */
export const createDataSyntaxValidator = (schemaRegistry) => (parsed) => {
  const issues = createValidationIssues()

  const data = parsed?.data || {}
  const processingType = parsed?.meta?.PROCESSING_TYPE?.value
  const getTableSchema = createTableSchemaGetter(processingType, schemaRegistry)
  const validatedTables = {}

  for (const [tableName, tableData] of Object.entries(data)) {
    const domainSchema = getTableSchema(tableName)

    if (!domainSchema) {
      // Keep unvalidated tables as-is
      validatedTables[tableName] = tableData
      continue
    }

    // Adapt domain schema for validateTable
    const schema = adaptDomainSchema(domainSchema)

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
