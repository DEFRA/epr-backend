import { UPDATE_WASTE_BALANCE_SCHEMA } from './table-schemas.schema.js'

/**
 * Schema registry for data table validation
 *
 * Each schema defines:
 * - requiredHeaders: Array of header names that must be present (order-independent)
 * - columnValidation: Map of header name -> Joi schema for that column's cells
 *
 * The validation engine will:
 * 1. Check that all required headers exist (allowing extras and different ordering)
 * 2. Validate each cell value against its column's Joi schema
 * 3. Report errors with precise location information
 */

/**
 * UPDATE_WASTE_BALANCE table schema
 * Tracks waste received for reprocessing
 */
const UPDATE_WASTE_BALANCE_TABLE_SCHEMA = {
  requiredHeaders: [
    'OUR_REFERENCE',
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
  columnValidation: UPDATE_WASTE_BALANCE_SCHEMA
}

/**
 * Table schema registry
 * Maps table names (from parsed.data keys) to their validation schemas
 */
export const TABLE_SCHEMAS = {
  UPDATE_WASTE_BALANCE: UPDATE_WASTE_BALANCE_TABLE_SCHEMA
  // Future tables can be added here:
  // MONTHLY_REPORTS: MONTHLY_REPORTS_TABLE_SCHEMA,
  // COMPLIANCE: COMPLIANCE_TABLE_SCHEMA,
  // REPROCESSED: REPROCESSED_TABLE_SCHEMA,
  // SENT_ON: SENT_ON_TABLE_SCHEMA
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
