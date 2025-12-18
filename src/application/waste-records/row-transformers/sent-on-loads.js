import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  PROCESSING_TYPE_TABLES,
  TABLE_NAMES
} from '#domain/summary-logs/table-schemas/index.js'

/**
 * Transforms a row from SENT_ON_LOADS table into waste record metadata
 *
 * @param {Record<string, any>} rowData - Row data mapped from headers
 * @param {number} rowIndex - Row index for error messages
 * @param {string} processingType - The processing type for the summary log
 * @returns {{wasteRecordType: string, rowId: string, data: Record<string, any>}}
 * @throws {Error} If required fields are missing
 */
export const transformSentOnLoadsRow = (rowData, rowIndex, processingType) => {
  const { rowIdField } =
    PROCESSING_TYPE_TABLES[processingType][TABLE_NAMES.SENT_ON_LOADS]

  if (!rowData[rowIdField]) {
    throw new Error(`Missing ${rowIdField} at row ${rowIndex}`)
  }

  if (!rowData.DATE_LOAD_LEFT_SITE) {
    throw new Error(`Missing DATE_LOAD_LEFT_SITE at row ${rowIndex}`)
  }

  return {
    wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
    rowId: rowData[rowIdField],
    data: {
      ...rowData,
      processingType
    }
  }
}
