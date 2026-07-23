import { PROCESSING_TYPE_TABLES } from '#domain/summary-logs/table-schemas/index.js'

/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 * @typedef {import('#domain/waste-records/model.js').WasteRecordType} WasteRecordType
 * @typedef {import('#common/validation/validation-issues.js').ValidationIssue} ValidationIssue
 * @typedef {import('#domain/summary-logs/table-schemas/validation-pipeline.js').RowOutcome} RowOutcome
 * @typedef {import('#domain/summary-logs/extractor/port.js').MetadataEntry} MetadataEntry
 */

/**
 * A row that can be transformed into a waste record.
 *
 * @typedef {Object} TransformableRow
 * @property {Record<string, any>} data - Row data as object keyed by header name
 * @property {string} [rowId] - Extracted row ID (set by data-syntax validator; not required for transformation)
 * @property {ValidationIssue[]} [issues] - Validation issues (present from validation pipeline)
 * @property {RowOutcome} outcome - Classification outcome from validation pipeline
 */

/**
 * A validated table section with rows converted to TransformableRow objects
 *
 * @typedef {Object} ValidatedTableSection
 * @property {TransformableRow[]} rows - Validated rows with data objects and optional issues/outcome
 */

/**
 * Validated summary log data ready for transformation
 *
 * This is the output from data syntax validation, where raw table rows have been
 * converted to TransformableRow objects with data keyed by header name.
 *
 * @typedef {Object} ValidatedSummaryLog
 * @property {Object<string, MetadataEntry>} meta - Metadata from the summary log
 * @property {Object<string, ValidatedTableSection>} data - Validated table sections keyed by table name
 */

/**
 * A waste record bundled with its validation issues and outcome
 *
 * @typedef {Object} ValidatedWasteRecord
 * @property {WasteRecord} record - The waste record
 * @property {ValidationIssue[]} [issues] - Validation issues (present from validation pipeline)
 * @property {RowOutcome} outcome - Classification outcome from validation pipeline
 * @property {string} tableName - The table schema key (e.g. RECEIVED_LOADS_FOR_EXPORT)
 * @property {string} wasteRecordType - The waste record type (e.g. received, exported, sentOn)
 */

/**
 * @typedef {Object} SummaryLogContext
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} [accreditationId]
 */

const KNOWN_PROCESSING_TYPES = Object.keys(PROCESSING_TYPE_TABLES)

/**
 * Generic table transformation function.
 *
 * Iterates over rows, coercing each into a waste record carrying the upload's
 * row data. Issues and outcome flow through from the validation pipeline.
 *
 * @param {ValidatedTableSection} tableData - Table data with rows
 * @param {(row: Record<string, any>) => {wasteRecordType: WasteRecordType, rowId: string, data: Record<string, any>}} rowTransformer - Function to transform row data
 * @param {SummaryLogContext} context - Registration context for the waste records
 * @param {{ tableName: string, wasteRecordType: WasteRecordType }} tableMeta
 * @returns {ValidatedWasteRecord[]} Array of waste records with issues and outcome
 */
const transformTable = (
  tableData,
  rowTransformer,
  context,
  { tableName, wasteRecordType: tableWasteRecordType }
) => {
  const { rows } = tableData
  const { organisationId, registrationId, accreditationId } = context

  return rows.map((row) => {
    const { data: rowData, issues, outcome } = row

    const { wasteRecordType, rowId, data } = rowTransformer(rowData)

    /** @type {WasteRecord} */
    const wasteRecord = {
      organisationId,
      registrationId,
      rowId,
      type: wasteRecordType,
      data
    }

    if (accreditationId) {
      wasteRecord.accreditationId = accreditationId
    }

    return {
      record: wasteRecord,
      issues,
      outcome,
      tableName,
      wasteRecordType: tableWasteRecordType
    }
  })
}

/**
 * Transforms validated summary log data into waste records.
 *
 * Each table's rows must have a `data` property with row values keyed by header
 * name. If rows have `issues` and `outcome` (from validation pipeline), these
 * flow through to the output.
 *
 * @param {ValidatedSummaryLog} parsedData - Validated summary log with TransformableRow[] in each table
 * @param {SummaryLogContext} summaryLogContext - Registration context for the waste records
 * @returns {ValidatedWasteRecord[]} Array of waste records with issues and outcome
 */
export const transformFromSummaryLog = (parsedData, summaryLogContext) => {
  // Check for unknown processing type
  const processingType = parsedData.meta.PROCESSING_TYPE?.value
  if (processingType && !KNOWN_PROCESSING_TYPES.includes(processingType)) {
    throw new Error(`Unknown PROCESSING_TYPE: ${processingType}`)
  }

  // Look up table schemas for this processing type
  const tableSchemas = PROCESSING_TYPE_TABLES[processingType] || {}

  // Transform each table that exists in the parsed data
  const results = Object.entries(tableSchemas).map(([tableName, schema]) => {
    const tableData = parsedData.data[tableName]

    // Skip tables that don't exist in this summary log or have no transformer
    if (!tableData || !schema.rowTransformer) {
      return []
    }

    return transformTable(tableData, schema.rowTransformer, summaryLogContext, {
      tableName,
      wasteRecordType: schema.wasteRecordType
    })
  })

  return results.flat()
}
