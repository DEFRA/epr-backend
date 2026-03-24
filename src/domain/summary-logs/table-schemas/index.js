import { PROCESSING_TYPES } from '../meta-fields.js'
import {
  TABLE_SCHEMAS as EXPORTER,
  MIN_TEMPLATE_VERSION as EXPORTER_MIN
} from './exporter/index.js'
import {
  TABLE_SCHEMAS as REPROCESSOR_INPUT,
  MIN_TEMPLATE_VERSION as REPROCESSOR_INPUT_MIN
} from './reprocessor-input/index.js'
import {
  TABLE_SCHEMAS as REPROCESSOR_OUTPUT,
  MIN_TEMPLATE_VERSION as REPROCESSOR_OUTPUT_MIN
} from './reprocessor-output/index.js'
import {
  TABLE_SCHEMAS as REPROCESSOR_REGISTERED_ONLY,
  MIN_TEMPLATE_VERSION as REPROCESSOR_REGISTERED_ONLY_MIN
} from './reprocessor-registered-only/index.js'
import {
  TABLE_SCHEMAS as EXPORTER_REGISTERED_ONLY,
  MIN_TEMPLATE_VERSION as EXPORTER_REGISTERED_ONLY_MIN
} from './exporter-registered-only/index.js'

/**
 * Registry mapping processing types to their table schemas
 *
 * Each table schema defines:
 * - rowIdField: Field name containing the row identifier
 * - wasteRecordType: The waste record type this table maps to (e.g. 'received', 'exported')
 * - sheetName: The spreadsheet sheet name for this table (e.g. 'Received', 'Exported')
 * - requiredHeaders: Headers that must be present in the table
 * - unfilledValues: Per-field values that indicate "unfilled" (e.g. dropdown placeholders)
 * - validationSchema: Joi schema for VAL010 (in-sheet validation of filled fields)
 * - classifyForWasteBalance: {@link import('./validation-pipeline.js').ClassifyForWasteBalance}|null — classifies a row for waste balance (null if table does not contribute)
 * - rowTransformer: Function to transform a parsed row into waste record metadata
 */
export const PROCESSING_TYPE_TABLES = {
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: REPROCESSOR_INPUT,
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: REPROCESSOR_OUTPUT,
  [PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY]: REPROCESSOR_REGISTERED_ONLY,
  [PROCESSING_TYPES.EXPORTER]: EXPORTER,
  [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY]: EXPORTER_REGISTERED_ONLY
}

export const MIN_TEMPLATE_VERSIONS = {
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: REPROCESSOR_INPUT_MIN,
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: REPROCESSOR_OUTPUT_MIN,
  [PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY]:
    REPROCESSOR_REGISTERED_ONLY_MIN,
  [PROCESSING_TYPES.EXPORTER]: EXPORTER_MIN,
  [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY]: EXPORTER_REGISTERED_ONLY_MIN
}

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @typedef {import('#domain/summary-logs/table-schemas/validation-pipeline.js').WasteBalanceClassificationResult} WasteBalanceClassificationResult */
/** @typedef {import('joi').ObjectSchema} JoiObjectSchema */
/**
 * @typedef {Object} TableSchema
 * @property {string} rowIdField - Field name containing the row identifier
 * @property {string} wasteRecordType - The waste record type this table maps to (e.g. 'received', 'exported')
 * @property {string} sheetName - The spreadsheet sheet name for this table (e.g. 'Received', 'Exported')
 * @property {(rowData: Record<string, any>, rowIndex: number) => {wasteRecordType: string, rowId: string, data: Record<string, any>}} rowTransformer - Function to transform a parsed row into waste record metadata
 * @property {string[]} requiredHeaders - Headers that must be present in the table
 * @property {Record<string, string[]>} unfilledValues - Per-field values that indicate "unfilled" (e.g. dropdown placeholders)
 * @property {JoiObjectSchema} validationSchema - Joi schema for VAL010 (in-sheet validation of filled fields)
 * @property {((data: Record<string, any>, context: {accreditation: Accreditation | null, overseasSites?: Record<number, { validFrom: Date | null }>}) => WasteBalanceClassificationResult) | null} classifyForWasteBalance - Classifies a row for waste balance (null if table does not contribute)
 */

/**
 * Finds a table schema by processing type and waste record type
 *
 * @param {string} processingType - The processing type (e.g. 'REPROCESSOR_INPUT')
 * @param {string} wasteRecordType - The waste record type (e.g. 'received', 'sentOn')
 * @returns {TableSchema|null} The matching table schema, or null if not found
 */
export const findSchemaForProcessingType = (
  processingType,
  wasteRecordType
) => {
  const tables = PROCESSING_TYPE_TABLES[processingType]
  if (!tables) {
    return null
  }

  return (
    Object.values(tables).find(
      (schema) => schema.wasteRecordType === wasteRecordType
    ) ?? null
  )
}

/**
 * Creates a table schema getter bound to a specific processing type
 *
 * @param {string} processingType - The processing type from meta.PROCESSING_TYPE
 * @param {Object} registry - Schema registry mapping processing types to table schemas
 * @returns {function(string): Object|null} A function that takes a table name and returns its schema
 */
export const createTableSchemaGetter = (processingType, registry) => {
  const tables = registry[processingType]
  return (tableName) => tables?.[tableName] || null
}

/**
 * Finds a table schema by waste record type, scanning across all processing types.
 *
 * @param {string} wasteRecordType - The waste record type to find (e.g. 'received', 'exported')
 * @param {Object} registry - Schema registry (PROCESSING_TYPE_TABLES)
 * @returns {{ tableName: string, schema: Object } | null} The table name and schema, or null if not found
 */
export const findSchemaByWasteRecordType = (wasteRecordType, registry) => {
  for (const tables of Object.values(registry)) {
    for (const [tableName, schema] of Object.entries(tables)) {
      if (schema.wasteRecordType === wasteRecordType) {
        return { tableName, schema }
      }
    }
  }
  return null
}

/**
 * Aggregates unfilledValues from all table schemas across all processing types
 * into a single per-column map for the parser's unfilledValues option.
 *
 * @param {Object} registry - Schema registry (PROCESSING_TYPE_TABLES)
 * @returns {Record<string, string[]>} Union of all unfilledValues across all schemas
 */
export const aggregateUnfilledValues = (registry) => {
  /** @type {Record<string, Set<string>>} */
  const sets = {}
  const allSchemas = Object.values(registry).flatMap(Object.values)
  for (const { unfilledValues } of allSchemas) {
    for (const [field, values] of Object.entries(unfilledValues)) {
      sets[field] ??= new Set()
      values.forEach((v) => sets[field].add(v))
    }
  }
  return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, [...v]]))
}
