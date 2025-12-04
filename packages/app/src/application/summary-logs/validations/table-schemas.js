import {
  RECEIVED_LOADS_FOR_REPROCESSING_FAILURE_SCHEMA,
  RECEIVED_LOADS_FOR_REPROCESSING_CONCERN_SCHEMA,
  EMPTY_SCHEMA
} from './table-schemas.schema.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

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
  rowIdField: 'ROW_ID',
  rowSchemas: {
    failure: RECEIVED_LOADS_FOR_REPROCESSING_FAILURE_SCHEMA,
    concern: RECEIVED_LOADS_FOR_REPROCESSING_CONCERN_SCHEMA
  }
}

/**
 * REPROCESSED_LOADS table schema
 * Tracks waste that has been processed (output from reprocessing)
 * No header or row validation yet - just registers the table as expected
 */
const REPROCESSED_LOADS_TABLE_SCHEMA = {
  requiredHeaders: [],
  rowIdField: 'ROW_ID',
  rowSchemas: {
    failure: EMPTY_SCHEMA,
    concern: EMPTY_SCHEMA
  }
}

/**
 * SENT_ON_LOADS table schema
 * Tracks waste sent on to other facilities (shared across processing types)
 * No header or row validation yet - just registers the table as expected
 */
const SENT_ON_LOADS_TABLE_SCHEMA = {
  requiredHeaders: [],
  rowIdField: 'ROW_ID',
  rowSchemas: {
    failure: EMPTY_SCHEMA,
    concern: EMPTY_SCHEMA
  }
}

/**
 * RECEIVED_LOADS_FOR_EXPORT table schema
 * Tracks waste received for export (exporter-specific)
 * No header or row validation yet - just registers the table as expected
 */
const RECEIVED_LOADS_FOR_EXPORT_TABLE_SCHEMA = {
  requiredHeaders: [],
  rowIdField: 'ROW_ID',
  rowSchemas: {
    failure: EMPTY_SCHEMA,
    concern: EMPTY_SCHEMA
  }
}

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
 * Maps processing types to expected tables and their schemas
 *
 * Each processing type defines which tables are expected in the summary log
 */
export const PROCESSING_TYPE_TABLES = {
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: {
    [TABLE_NAMES.RECEIVED_LOADS_FOR_REPROCESSING]:
      RECEIVED_LOADS_FOR_REPROCESSING_TABLE_SCHEMA,
    [TABLE_NAMES.REPROCESSED_LOADS]: REPROCESSED_LOADS_TABLE_SCHEMA,
    [TABLE_NAMES.SENT_ON_LOADS]: SENT_ON_LOADS_TABLE_SCHEMA
  },
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: {
    [TABLE_NAMES.RECEIVED_LOADS_FOR_REPROCESSING]:
      RECEIVED_LOADS_FOR_REPROCESSING_TABLE_SCHEMA,
    [TABLE_NAMES.REPROCESSED_LOADS]: REPROCESSED_LOADS_TABLE_SCHEMA,
    [TABLE_NAMES.SENT_ON_LOADS]: SENT_ON_LOADS_TABLE_SCHEMA
  },
  [PROCESSING_TYPES.EXPORTER]: {
    [TABLE_NAMES.RECEIVED_LOADS_FOR_EXPORT]:
      RECEIVED_LOADS_FOR_EXPORT_TABLE_SCHEMA,
    [TABLE_NAMES.SENT_ON_LOADS]: SENT_ON_LOADS_TABLE_SCHEMA
  }
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
