import {
  RECEIVED_LOADS_FOR_REPROCESSING_FAILURE_SCHEMA,
  RECEIVED_LOADS_FOR_REPROCESSING_CONCERN_SCHEMA
} from './table-schemas.schema.js'

/**
 * Schema registry for data table validation
 *
 * Each schema defines:
 * - requiredHeaders: Array of header names that must be present (order-independent)
 * - rowSchemas.failure: Joi schema for critical validations (e.g. ROW_ID) - produces failures that reject entire spreadsheet
 * - rowSchemas.concern: Joi schema for data validations - produces concerns that mark individual rows as invalid
 *
 * The validation engine will:
 * 1. Check that all required headers exist (allowing extras and different ordering)
 * 2. Validate each row with rowSchemas.failure first (produces failures)
 * 3. If no failures, validate with rowSchemas.concern (produces concerns)
 * 4. Report errors with precise location information
 */

/**
 * RECEIVED_LOADS_FOR_REPROCESSING table schema
 * Tracks waste received for reprocessing
 */
const RECEIVED_LOADS_FOR_REPROCESSING_TABLE_SCHEMA = {
  requiredHeaders: [
    'ROW_ID',
    'DATE_RECEIVED_FOR_REPROCESSING',
    'EWC_CODE',
    'GROSS_WEIGHT',
    'TARE_WEIGHT',
    'PALLET_WEIGHT',
    'NET_WEIGHT',
    'BAILING_WIRE_PROTOCOL',
    'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
    'WEIGHT_OF_NON_TARGET_MATERIALS',
    'RECYCLABLE_PROPORTION_PERCENTAGE',
    'TONNAGE_RECEIVED_FOR_RECYCLING'
  ],
  rowSchemas: {
    failure: RECEIVED_LOADS_FOR_REPROCESSING_FAILURE_SCHEMA,
    concern: RECEIVED_LOADS_FOR_REPROCESSING_CONCERN_SCHEMA
  }
}

/**
 * Table schema registry
 * Maps table names (from parsed.data keys) to their validation schemas
 */
export const TABLE_SCHEMAS = {
  RECEIVED_LOADS_FOR_REPROCESSING: RECEIVED_LOADS_FOR_REPROCESSING_TABLE_SCHEMA
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
