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
 * @returns {string} The field name containing the row ID
 * @throws {Error} If no metadata is defined for the table
 */
export const getRowIdField = (tableName) => {
  const metadata = TABLE_METADATA[tableName]
  if (!metadata) {
    throw new Error(`No metadata defined for table: ${tableName}`)
  }
  return metadata.rowIdField
}

/**
 * Gets the waste record type for a table
 *
 * @param {string} tableName - The table name
 * @returns {string} The waste record type
 * @throws {Error} If no metadata is defined for the table
 */
export const getWasteRecordType = (tableName) => {
  const metadata = TABLE_METADATA[tableName]
  if (!metadata) {
    throw new Error(`No metadata defined for table: ${tableName}`)
  }
  return metadata.wasteRecordType
}
