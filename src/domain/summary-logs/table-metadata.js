import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/**
 * Central registry of table metadata
 *
 * This provides a single source of truth for:
 * - Which field contains the row identifier for each table
 * - Which waste record type each table maps to
 *
 * Used by both classification (to identify rows for comparison)
 * and transformation (to extract row IDs for storage).
 */
export const TABLE_METADATA = {
  RECEIVED_LOADS_FOR_REPROCESSING: {
    rowIdField: 'ROW_ID',
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED
  }
  // Add more tables as needed
}

/**
 * Gets the row ID field name for a table
 *
 * @param {string} tableName - The table name
 * @returns {string|null} The field name containing the row ID, or null if unknown
 */
export const getRowIdField = (tableName) => {
  return TABLE_METADATA[tableName]?.rowIdField ?? null
}

/**
 * Gets the waste record type for a table
 *
 * @param {string} tableName - The table name
 * @returns {string|null} The waste record type, or null if unknown
 */
export const getWasteRecordType = (tableName) => {
  return TABLE_METADATA[tableName]?.wasteRecordType ?? null
}
