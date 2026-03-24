import { randomUUID } from 'node:crypto'
import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { PROCESSING_TYPE_TABLES } from '#domain/summary-logs/table-schemas/index.js'

/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 * @typedef {import('#domain/waste-records/model.js').WasteRecordType} WasteRecordType
 * @typedef {import('#common/validation/validation-issues.js').ValidationIssue} ValidationIssue
 * @typedef {import('#domain/summary-logs/table-schemas/validation-pipeline.js').RowOutcome} RowOutcome
 * @typedef {import('#domain/summary-logs/extractor/port.js').MetadataEntry} MetadataEntry
 */

/**
 * A row that can be transformed into a waste record
 *
 * @typedef {Object} TransformableRow
 * @property {Record<string, any>} data - Row data as object keyed by header name
 * @property {ValidationIssue[]} [issues] - Validation issues (present from validation pipeline)
 * @property {RowOutcome} [outcome] - Classification outcome (present from validation pipeline)
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
 * @typedef {'created' | 'updated' | 'unchanged'} WasteRecordChange
 */

/**
 * A waste record bundled with its validation issues and outcome
 *
 * @typedef {Object} ValidatedWasteRecord
 * @property {WasteRecord} record - The waste record
 * @property {ValidationIssue[]} [issues] - Validation issues (present from validation pipeline)
 * @property {RowOutcome} [outcome] - Classification outcome (present from validation pipeline)
 * @property {WasteRecordChange} change - What happened to this record: created, updated, or unchanged
 * @property {string} tableName - The table schema key (e.g. RECEIVED_LOADS_FOR_EXPORT)
 * @property {string} wasteRecordType - The waste record type (e.g. received, exported, sentOn)
 */

const KNOWN_PROCESSING_TYPES = Object.keys(PROCESSING_TYPE_TABLES)

/**
 * Updates an existing waste record with changed fields, or returns it unchanged.
 *
 * @param {WasteRecord} existingRecord
 * @param {Record<string, any>} data - Full row data from the transformer
 * @param {{ timestamp: string, summaryLog: object }} versionContext
 * @returns {{ record: WasteRecord, change: WasteRecordChange }}
 */
const updateExistingRecord = (
  existingRecord,
  data,
  { timestamp, summaryLog }
) => {
  const delta = {}
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'ROW_ID' && existingRecord.data[key] !== value) {
      delta[key] = value
    }
  }

  if (Object.keys(delta).length === 0) {
    return { record: existingRecord, change: 'unchanged' }
  }

  return {
    record: {
      ...existingRecord,
      data,
      versions: [
        ...existingRecord.versions,
        {
          id: randomUUID(),
          createdAt: timestamp,
          status: VERSION_STATUS.UPDATED,
          summaryLog,
          data: delta
        }
      ]
    },
    change: 'updated'
  }
}

/**
 * Generic table transformation function
 * Iterates over rows, transforms each using a row transformer, and creates or updates waste records
 *
 * If issues and outcome are present on input rows, they flow through to the output.
 *
 * @param {Object} tableData - Table data with rows
 * @param {TransformableRow[]} tableData.rows - Array of rows to transform
 * @param {function(Record<string, any>): {wasteRecordType: WasteRecordType, rowId: string, data: Record<string, any>}} rowTransformer - Function to transform row data
 * @param {Object} context - Context for creating waste records
 * @param {Object} context.summaryLog - Summary log reference
 * @param {string} context.summaryLog.id - Summary log ID
 * @param {string} context.summaryLog.uri - Summary log URI
 * @param {string} context.organisationId - Organisation ID
 * @param {string} context.registrationId - Registration ID
 * @param {string} [context.accreditationId] - Accreditation ID
 * @param {string} context.timestamp - ISO timestamp for version createdAt
 * @param {Map<string, WasteRecord>} existingRecords - Map of existing records keyed by "${type}:${rowId}"
 * @returns {ValidatedWasteRecord[]} Array of waste records with issues and outcome
 */
const transformTable = (
  tableData,
  rowTransformer,
  context,
  existingRecords,
  { tableName, wasteRecordType: tableWasteRecordType } = {}
) => {
  const { rows } = tableData
  const {
    summaryLog,
    organisationId,
    registrationId,
    accreditationId,
    timestamp
  } = context

  return rows.map((row) => {
    const { data: rowData, issues, outcome } = row

    // Transform row using type-specific transformer
    const { wasteRecordType, rowId, data } = rowTransformer(rowData)

    // Look up existing waste record from Map
    const existingRecord =
      existingRecords.get(`${wasteRecordType}:${rowId}`) ?? null

    if (existingRecord) {
      const updated = updateExistingRecord(existingRecord, data, {
        timestamp,
        summaryLog
      })
      return {
        ...updated,
        issues,
        outcome,
        tableName,
        wasteRecordType: tableWasteRecordType
      }
    }

    // Create new waste record
    const version = {
      id: randomUUID(),
      createdAt: timestamp,
      status: VERSION_STATUS.CREATED,
      summaryLog,
      data
    }

    const wasteRecord = {
      organisationId,
      registrationId,
      rowId,
      type: wasteRecordType,
      data,
      versions: [version]
    }

    // Only include accreditationId if provided
    if (accreditationId) {
      wasteRecord.accreditationId = accreditationId
    }

    return {
      record: wasteRecord,
      issues,
      outcome,
      change: 'created',
      tableName,
      wasteRecordType: tableWasteRecordType
    }
  })
}

/**
 * Transforms validated summary log data into waste records
 *
 * Each table's rows must have a `data` property with row values keyed by header name.
 * If rows have `issues` and `outcome` (from validation pipeline), these flow through
 * to the output.
 *
 * @param {ValidatedSummaryLog} parsedData - Validated summary log with TransformableRow[] in each table
 * @param {Object} summaryLogContext - Context from the summary log
 * @param {Object} summaryLogContext.summaryLog - The summary log reference
 * @param {string} summaryLogContext.summaryLog.id - The summary log ID
 * @param {string} summaryLogContext.summaryLog.uri - The S3 URI for the summary log
 * @param {string} summaryLogContext.organisationId - The organisation ID
 * @param {string} summaryLogContext.registrationId - The registration ID
 * @param {string} [summaryLogContext.accreditationId] - Optional accreditation ID
 * @param {string} summaryLogContext.timestamp - ISO timestamp for version createdAt
 * @param {Map<string, WasteRecord>} existingRecords - Map of existing records keyed by "${type}:${rowId}"
 * @returns {ValidatedWasteRecord[]} Array of waste records with issues and outcome
 */
export const transformFromSummaryLog = (
  parsedData,
  summaryLogContext,
  existingRecords
) => {
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

    return transformTable(
      tableData,
      schema.rowTransformer,
      summaryLogContext,
      existingRecords,
      { tableName, wasteRecordType: schema.wasteRecordType }
    )
  })

  return results.flat()
}
