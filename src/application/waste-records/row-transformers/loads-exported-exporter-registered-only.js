import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { LOADS_EXPORTED_FIELDS } from '#domain/summary-logs/table-schemas/exporter-registered-only/fields.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

const rowIdField = LOADS_EXPORTED_FIELDS.ROW_ID

/**
 * Transforms a row from LOADS_EXPORTED table into waste record metadata
 * (Exporter Registered-Only)
 *
 * @param {Record<string, any>} rowData - Row data mapped from headers
 * @param {number} rowIndex - Row index for error messages
 * @returns {{wasteRecordType: string, rowId: string, data: Record<string, any>}}
 * @throws {Error} If required fields are missing
 */
export const transformLoadsExportedRowRegisteredOnly = (rowData, rowIndex) => {
  if (!rowData[rowIdField]) {
    throw new Error(`Missing ${rowIdField} at row ${rowIndex}`)
  }

  return {
    wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
    rowId: rowData[rowIdField],
    data: {
      ...rowData,
      processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
    }
  }
}
