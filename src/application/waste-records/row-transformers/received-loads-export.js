import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  PROCESSING_TYPE_TABLES,
  TABLE_NAMES
} from '#domain/summary-logs/table-schemas/index.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

const { rowIdField } =
  PROCESSING_TYPE_TABLES[PROCESSING_TYPES.EXPORTER][
    TABLE_NAMES.RECEIVED_LOADS_FOR_EXPORT
  ]

/**
 * Transforms a row from RECEIVED_LOADS_FOR_EXPORT table into waste record metadata
 *
 * @param {Record<string, any>} rowData - Row data mapped from headers
 * @param {number} rowIndex - Row index for error messages
 * @returns {{wasteRecordType: string, rowId: string, data: Record<string, any>}}
 * @throws {Error} If required fields are missing
 */
export const transformExportLoadsRow = (rowData, rowIndex) => {
  if (!rowData[rowIdField]) {
    throw new Error(`Missing ${rowIdField} at row ${rowIndex}`)
  }

  // Basic validation for required fields if needed, but for now just rowId
  // The schema validation handles most checks before this point

  return {
    wasteRecordType: WASTE_RECORD_TYPE.EXPORTED, // Or maybe EXPORTED?
    rowId: rowData[rowIdField],
    data: {
      ...rowData,
      processingType: PROCESSING_TYPES.EXPORTER // Important for field mapping!
    }
  }
}
