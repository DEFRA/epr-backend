import { getTableSchema } from './validations/table-schemas.js'
import {
  getRowIdField,
  getWasteRecordType
} from '#domain/summary-logs/table-metadata.js'

/**
 * @typedef {Object} LoadCounts
 * @property {{ valid: number, invalid: number }} new - Counts for new loads
 * @property {{ valid: number, invalid: number }} unchanged - Counts for unchanged loads
 * @property {{ valid: number, invalid: number }} adjusted - Counts for adjusted loads
 */

/**
 * Creates an empty load counts structure
 *
 * @returns {LoadCounts}
 */
const createEmptyLoadCounts = () => ({
  new: { valid: 0, invalid: 0 },
  unchanged: { valid: 0, invalid: 0 },
  adjusted: { valid: 0, invalid: 0 }
})

/**
 * Gets the row key for an issue if it has valid location data
 *
 * @param {Object} issue - A validation issue
 * @param {Object} parsed - The parsed summary log data
 * @returns {string|null} Row key in format "tableName:rowIndex" or null
 */
const getInvalidRowKey = (issue, parsed) => {
  const location = issue.context?.location
  if (!location?.table || location?.row === undefined) {
    return null
  }

  const tableName = location.table
  const tableData = parsed?.data?.[tableName]

  if (!tableData?.location?.row) {
    return null
  }

  // Convert spreadsheet row to array index
  // Spreadsheet row includes header row, so subtract header row and 1
  const headerRow = tableData.location.row
  const rowIndex = location.row - headerRow - 1

  return rowIndex >= 0 ? `${tableName}:${rowIndex}` : null
}

/**
 * Builds a set of row keys that have validation errors
 *
 * @param {Array} issues - Array of validation issues
 * @param {Object} parsed - The parsed summary log data
 * @returns {Set<string>} Set of keys in format "tableName:rowIndex"
 */
const buildInvalidRowKeys = (issues, parsed) => {
  const invalidRowKeys = new Set()

  for (const issue of issues) {
    const rowKey = getInvalidRowKey(issue, parsed)
    if (rowKey) {
      invalidRowKeys.add(rowKey)
    }
  }

  return invalidRowKeys
}

/**
 * Builds a map of existing row IDs by type
 *
 * @param {Array} existingWasteRecords - Array of existing waste records
 * @returns {Map<string, Set<string>>} Map of waste record type to set of row IDs
 */
const buildExistingRowIdsByType = (existingWasteRecords) => {
  const existingRowIds = new Map()

  for (const record of existingWasteRecords || []) {
    if (!existingRowIds.has(record.type)) {
      existingRowIds.set(record.type, new Set())
    }
    existingRowIds.get(record.type).add(String(record.rowId))
  }

  return existingRowIds
}

/**
 * Builds a map to check if existing records have changed
 *
 * @param {Array} existingWasteRecords - Array of existing waste records
 * @returns {Map<string, Object>} Map of "type:rowId" to record data
 */
const buildExistingRecordData = (existingWasteRecords) => {
  const existingData = new Map()

  for (const record of existingWasteRecords || []) {
    const key = `${record.type}:${record.rowId}`
    existingData.set(key, record.data)
  }

  return existingData
}

/**
 * Extracts the row ID from a row based on the table's ID field
 *
 * @param {Object} rowObject - Row data as object with header keys
 * @param {string} tableName - Name of the table
 * @returns {string|null} The row ID or null if not found
 */
export const getRowId = (rowObject, tableName) => {
  const idField = getRowIdField(tableName)
  if (!idField) {
    return null
  }

  const value = rowObject[idField]
  return value !== null && value !== undefined ? String(value) : null
}

/**
 * Converts row array to object using headers
 *
 * @param {Array} row - Row data as array
 * @param {Array<string>} headers - Array of header names
 * @returns {Object} Row data as object with header keys
 */
const rowToObject = (row, headers) => {
  const result = {}
  for (let i = 0; i < headers.length; i++) {
    if (headers[i]) {
      result[headers[i]] = row[i]
    }
  }
  return result
}

/**
 * Checks if row data has changed from existing record
 *
 * @param {Object} rowObject - Current row data
 * @param {Object} existingData - Existing record data
 * @returns {boolean} True if data has changed
 */
const hasRowChanged = (rowObject, existingData) => {
  if (!existingData) {
    return false
  }

  // Compare each field in the row with existing data
  for (const [key, value] of Object.entries(rowObject)) {
    if (existingData[key] !== undefined && existingData[key] !== value) {
      return true
    }
  }

  return false
}

/**
 * Determines the classification for a single row
 *
 * @param {Object} params
 * @param {string} params.rowId - The row ID
 * @param {Object} params.rowObject - Row data as object
 * @param {Set<string>} params.existingRowIdsForType - Set of existing row IDs for this type
 * @param {string} params.wasteRecordType - The waste record type
 * @param {Map<string, Object>} params.existingRecordData - Map of existing record data
 * @returns {'new'|'unchanged'|'adjusted'} The classification
 */
const classifyRow = ({
  rowId,
  rowObject,
  existingRowIdsForType,
  wasteRecordType,
  existingRecordData
}) => {
  if (!rowId || !existingRowIdsForType.has(rowId)) {
    return 'new'
  }

  const existingKey = `${wasteRecordType}:${rowId}`
  const existingData = existingRecordData.get(existingKey)

  return hasRowChanged(rowObject, existingData) ? 'adjusted' : 'unchanged'
}

/**
 * Classifies loads from a summary log and returns counts
 *
 * Classification dimensions:
 * - new: Load not present in any previous submission
 * - unchanged: Load exists in previous submission, data has not changed
 * - adjusted: Load exists in previous submission, data has changed
 *
 * Validity:
 * - valid: Load passes all validation rules
 * - invalid: Load has validation errors
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log data
 * @param {Array} params.issues - Array of validation issues
 * @param {Array} params.existingWasteRecords - Existing waste records from previous uploads
 * @returns {LoadCounts} Counts of loads by classification
 */
export const classifyLoads = ({ parsed, issues, existingWasteRecords }) => {
  const counts = createEmptyLoadCounts()

  const data = parsed?.data || {}
  const invalidRowKeys = buildInvalidRowKeys(issues, parsed)
  const existingRowIds = buildExistingRowIdsByType(existingWasteRecords)
  const existingRecordData = buildExistingRecordData(existingWasteRecords)

  for (const [tableName, tableData] of Object.entries(data)) {
    // Only count tables that have schemas (known table types)
    const schema = getTableSchema(tableName)
    if (!schema) {
      continue
    }

    const { headers, rows } = tableData
    const wasteRecordType = getWasteRecordType(tableName)
    const existingRowIdsForType =
      existingRowIds.get(wasteRecordType) || new Set()

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const rowKey = `${tableName}:${rowIndex}`
      const isInvalid = invalidRowKeys.has(rowKey)
      const validityKey = isInvalid ? 'invalid' : 'valid'

      const rowObject = rowToObject(rows[rowIndex], headers)
      const rowId = getRowId(rowObject, tableName)

      const classification = classifyRow({
        rowId,
        rowObject,
        existingRowIdsForType,
        wasteRecordType,
        existingRecordData
      })

      counts[classification][validityKey]++
    }
  }

  return counts
}
