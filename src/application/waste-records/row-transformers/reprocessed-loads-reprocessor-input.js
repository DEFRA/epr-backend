import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { REPROCESSED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/reprocessor-input/fields.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

/**
 * Transforms a row from REPROCESSED_LOADS table (REPROCESSOR_INPUT) into waste record metadata
 *
 * @param {Record<string, any>} rowData - Row data mapped from headers
 * @param {number} rowIndex - Row index for error messages
 * @returns {{wasteRecordType: string, rowId: string, data: Record<string, any>}}
 * @throws {Error} If required fields are missing
 */
export const transformReprocessedLoadsRowReprocessorInput = (
  rowData,
  rowIndex
) => {
  const rowIdField = REPROCESSED_LOADS_FIELDS.ROW_ID

  if (!rowData[rowIdField]) {
    throw new Error(`Missing ${rowIdField} at row ${rowIndex}`)
  }

  return {
    wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
    rowId: rowData[rowIdField],
    data: {
      ...rowData,
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
    }
  }
}
