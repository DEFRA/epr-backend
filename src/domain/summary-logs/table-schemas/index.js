import { TABLE_SCHEMAS as REPROCESSOR_INPUT } from './reprocessor-input/index.js'
import { TABLE_SCHEMAS as REPROCESSOR_OUTPUT } from './reprocessor-output/index.js'
import { TABLE_SCHEMAS as EXPORTER } from './exporter/index.js'
import { PROCESSING_TYPES } from '../meta-fields.js'

/**
 * Table names used in summary logs
 */
export const TABLE_NAMES = {
  RECEIVED_LOADS_FOR_REPROCESSING: 'RECEIVED_LOADS_FOR_REPROCESSING',
  REPROCESSED_LOADS: 'REPROCESSED_LOADS',
  SENT_ON_LOADS: 'SENT_ON_LOADS',
  RECEIVED_LOADS_FOR_EXPORT: 'RECEIVED_LOADS_FOR_EXPORT'
}

/**
 * Registry mapping processing types to their table schemas
 *
 * Each table schema defines:
 * - rowIdField: Field name containing the row identifier
 * - requiredHeaders: Headers that must be present in the table
 * - unfilledValues: Per-field values that indicate "unfilled" (e.g. dropdown placeholders)
 * - validationSchema: Joi schema for VAL010 (in-sheet validation of filled fields)
 * - fieldsRequiredForInclusionInWasteBalance: Fields required for VAL011 (mandatory for Waste Balance)
 */
export const PROCESSING_TYPE_TABLES = {
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: REPROCESSOR_INPUT,
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: REPROCESSOR_OUTPUT,
  [PROCESSING_TYPES.EXPORTER]: EXPORTER
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
 * Aggregates unfilledValues from all table schemas across all processing types
 * into a single per-column map for the parser's emptyCellValues option.
 *
 * @param {Object} registry - Schema registry (PROCESSING_TYPE_TABLES)
 * @returns {Record<string, string[]>} Union of all unfilledValues across all schemas
 */
export const aggregateEmptyCellValues = (registry) => {
  /** @type {Record<string, string[]>} */
  const result = {}
  for (const tables of Object.values(registry)) {
    for (const schema of Object.values(tables)) {
      for (const [field, values] of Object.entries(schema.unfilledValues)) {
        if (!result[field]) {
          result[field] = [...values]
        } else {
          for (const value of values) {
            if (!result[field].includes(value)) {
              result[field].push(value)
            }
          }
        }
      }
    }
  }
  return result
}
