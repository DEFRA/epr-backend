import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import { offsetColumn } from '#common/helpers/spreadsheet/columns.js'
import {
  isEprMarker,
  SKIP_HEADER_ROW_TEXT
} from '#domain/summary-logs/markers.js'
import {
  classifyRow,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { createTableSchemaGetter } from '#domain/summary-logs/table-schemas/index.js'
import { MESSAGES } from '#domain/summary-logs/table-schemas/shared/joi-messages.js'
import { NET_WEIGHT_MESSAGES } from '#domain/summary-logs/table-schemas/shared/validators/net-weight-validator.js'
import { TONNAGE_EXPORT_MESSAGES } from '#domain/summary-logs/table-schemas/exporter/validators/tonnage-export-validator.js'
import { TONNAGE_RECEIVED_MESSAGES } from '#domain/summary-logs/table-schemas/reprocessor-input/validators/tonnage-received-validator.js'
import { UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES } from '#domain/summary-logs/table-schemas/reprocessor-output/validators/uk-packaging-weight-proportion-validator.js'

/**
 * @typedef {import('#common/validation/validation-issues.js').ValidationIssue} ValidationIssue
 * @typedef {import('#domain/summary-logs/table-schemas/validation-pipeline.js').RowOutcome} RowOutcome
 */

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
 * Adapts domain table schema to the structure expected by validateTable
 *
 * Domain schemas use: unfilledValues, validationSchema, fieldsRequiredForInclusionInWasteBalance
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
 * Joi error type to application error code mapping
 *
 * When adding new Joi validators to table schemas, ensure the error types
 * they produce are mapped here. Unmapped types will throw an error.
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
  'custom.netWeightCalculationMismatch':
    VALIDATION_CODE.CALCULATED_VALUE_MISMATCH,
  'custom.tonnageCalculationMismatch':
    VALIDATION_CODE.CALCULATED_VALUE_MISMATCH,
  'custom.ukPackagingProportionCalculationMismatch':
    VALIDATION_CODE.CALCULATED_VALUE_MISMATCH
})

/**
 * Maps Joi validation error types to application error codes
 *
 * @param {string} joiType - The Joi error type (e.g., 'number.min', 'string.pattern.base')
 * @returns {string} The application error code
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
  // Maps to the legacy MUST_BE_ALPHANUMERIC code for now (for backwards
  // compatibility), as the frontend also needs updating to support correct
  // mapping of this new code...
  [MESSAGES.MUST_CONTAIN_ONLY_PERMITTED_CHARACTERS]:
    VALIDATION_CODE.MUST_BE_ALPHANUMERIC,
  [MESSAGES.MUST_BE_3_DIGIT_NUMBER]: VALIDATION_CODE.MUST_BE_3_DIGIT_NUMBER,
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
  [TONNAGE_RECEIVED_MESSAGES['custom.tonnageCalculationMismatch']]:
    VALIDATION_CODE.TONNAGE_CALCULATION_MISMATCH,
  [UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES[
    'custom.ukPackagingProportionCalculationMismatch'
  ]]: VALIDATION_CODE.UK_PACKAGING_PROPORTION_CALCULATION_MISMATCH
})

const mapMessageToErrorCode = (message) => JOI_MESSAGE_TO_ERROR_CODE[message]

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
 * @param {number} params.rowNumber - Actual spreadsheet row number
 * @param {string} params.fieldName - Name of the field with the error
 * @param {number|undefined} params.colIndex - Column index for the field
 * @param {Object} params.location - Table location in spreadsheet
 * @returns {Object} Cell location object
 */
const buildCellLocation = ({
  tableName,
  rowNumber,
  fieldName,
  colIndex,
  location
}) =>
  location?.column && colIndex !== undefined
    ? {
        sheet: location.sheet,
        table: tableName,
        row: rowNumber,
        column: offsetColumn(location.column, colIndex),
        header: fieldName
      }
    : { table: tableName, header: fieldName }

const toApplicationIssue = ({
  issue,
  classification,
  fatalFields,
  headerToIndexMap,
  rowObject,
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

  const isFatalField =
    classification.outcome === ROW_OUTCOME.REJECTED &&
    fatalFields.includes(fieldName)

  const context = {
    location: buildCellLocation({
      tableName,
      rowNumber,
      fieldName,
      colIndex,
      location
    }),
    actual: rowObject[fieldName]
  }

  if (errorCode) {
    context.errorCode = errorCode
  }

  return {
    category: VALIDATION_CATEGORY.TECHNICAL,
    severity: isFatalField ? 'fatal' : 'error',
    message,
    code,
    context
  }
}

const recordIssues = (rowIssues, issues) => {
  for (const rowIssue of rowIssues) {
    if (rowIssue.severity === 'fatal') {
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
}

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
 * @param {Array<{rowNumber: number, values: Array<*>}>} params.rows - Array of raw data rows
 * @param {Object} params.domainSchema - Domain table schema with unfilledValues, validationSchema, fieldsRequiredForInclusionInWasteBalance
 * @param {Object} params.location - Table location in spreadsheet
 * @param {ReturnType<typeof createValidationIssues>} params.issues - Validation issues collector
 * @returns {ValidatedRow[]} Array of validated rows with outcome and issues attached
 */
/**
 * Checks whether a row should be filtered out before validation.
 *
 * Rows are filtered when the row ID field contains template artefacts
 * rather than real data: user-facing header description rows or
 * pre-populated empty template rows.
 *
 * @param {Record<string, *>} rowObject - Row data keyed by header name
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

const validateRows = ({
  tableName,
  headerToIndexMap,
  rows,
  domainSchema,
  location,
  issues
}) => {
  const fatalFields = domainSchema.fatalFields || []

  return rows.flatMap(({ rowNumber, values }) => {
    const rowObject = {}
    for (const [headerName, colIndex] of headerToIndexMap) {
      rowObject[headerName] = values[colIndex]
    }

    if (isTemplateRow(rowObject, domainSchema.rowIdField)) {
      return []
    }

    const classification = classifyRow(rowObject, domainSchema)

    const rowIssues = classification.issues.map((issue) =>
      toApplicationIssue({
        issue,
        classification,
        fatalFields,
        headerToIndexMap,
        rowObject,
        tableName,
        rowNumber,
        location
      })
    )

    recordIssues(rowIssues, issues)

    return [
      {
        data: rowObject,
        rowId: String(rowObject[domainSchema.rowIdField]),
        outcome: classification.outcome,
        issues: rowIssues
      }
    ]
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
      const location = tableData.location
        ? { sheet: tableData.location.sheet, table: tableName }
        : { table: tableName }

      issues.addFatal(
        VALIDATION_CATEGORY.TECHNICAL,
        `Unrecognised table '${tableName}' has no schema for this processing type`,
        VALIDATION_CODE.TABLE_UNRECOGNISED,
        { location }
      )

      // Keep unvalidated tables as-is for downstream processing
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
