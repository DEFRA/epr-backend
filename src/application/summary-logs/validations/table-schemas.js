import {
  RECEIVED_LOADS_FOR_REPROCESSING_SCHEMA,
  RECEIVED_LOADS_FOR_REPROCESSING_ROW_SCHEMA
} from './table-schemas.schema.js'

/**
 * Schema registry for data table validation
 *
 * Each schema defines:
 * - requiredHeaders: Array of header names that must be present (order-independent)
 * - columnValidation: Map of header name -> Joi schema for that column's cells (legacy/reference)
 * - rowSchema: Joi object schema for validating entire rows at once
 *
 * The validation engine will:
 * 1. Check that all required headers exist (allowing extras and different ordering)
 * 2. Validate each row as a complete object using the rowSchema
 * 3. Report errors with precise location information
 */

/**
 * RECEIVED_LOADS_FOR_REPROCESSING table schema
 * Tracks waste received for reprocessing
 */
const RECEIVED_LOADS_FOR_REPROCESSING_TABLE_SCHEMA = {
  requiredHeaders: [
    'ROW_ID',
    'DATE_RECEIVED',
    'EWC_CODE',
    'GROSS_WEIGHT',
    'TARE_WEIGHT',
    'PALLET_WEIGHT',
    'NET_WEIGHT',
    'BAILING_WIRE',
    'HOW_CALCULATE_RECYCLABLE',
    'WEIGHT_OF_NON_TARGET',
    'RECYCLABLE_PROPORTION',
    'TONNAGE_RECEIVED_FOR_EXPORT'
  ],
  columnValidation: RECEIVED_LOADS_FOR_REPROCESSING_SCHEMA,
  rowSchema: RECEIVED_LOADS_FOR_REPROCESSING_ROW_SCHEMA
}

/**
 * Table schema registry
 * Maps table names (from parsed.data keys) to their validation schemas
 */
export const TABLE_SCHEMAS = {
  RECEIVED_LOADS_FOR_REPROCESSING: RECEIVED_LOADS_FOR_REPROCESSING_TABLE_SCHEMA
  // Future tables can be added here:
  // REPROCESSED_LOADS: REPROCESSED_LOADS_TABLE_SCHEMA,
  // SENT_ON_LOADS: SENT_ON_LOADS_TABLE_SCHEMA,
  // RECEIVED_LOADS_FOR_EXPORT: RECEIVED_LOADS_FOR_EXPORT_TABLE_SCHEMA
}

/**
 * Gets the schema for a given table name
 *
 * @param {string} tableName - The table name from parsed.data
 * @returns {Object|null} The schema object or null if no schema is defined
 */
export const getTableSchema = (tableName) => {
  return TABLE_SCHEMAS[tableName] || null
}
