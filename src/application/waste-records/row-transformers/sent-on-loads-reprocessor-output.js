import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { SENT_ON_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/shared/index.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

/**
 * Transforms a row from SENT_ON_LOADS table into waste record metadata (Reprocessor Output)
 *
 * @param {Record<string, any>} rowData - Row data mapped from headers
 * @param {number} rowIndex - Row index for error messages
 * @returns {{wasteRecordType: string, rowId: string, data: Record<string, any>}}
 * @throws {Error} If required fields are missing
 */
export const transformSentOnLoadsRowReprocessorOutput = (rowData, rowIndex) => {
  const rowIdField = SENT_ON_LOADS_FIELDS.ROW_ID

  if (!rowData[rowIdField]) {
    throw new Error(`Missing ${rowIdField} at row ${rowIndex}`)
  }

  return {
    wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
    rowId: rowData[rowIdField],
    data: {
      ...rowData,
      processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
    }
  }
}
