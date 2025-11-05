import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/**
 * Transforms a row from RECEIVED_LOADS_FOR_REPROCESSING table into waste record metadata
 *
 * @param {Record<string, any>} rowData - Row data mapped from headers
 * @param {number} rowIndex - Row index for error messages
 * @returns {Promise<{wasteRecordType: string, rowId: string, data: Record<string, any>}>}
 * @throws {Error} If required fields are missing
 */
export const transformReceivedLoadsRow = async (rowData, rowIndex) => {
  if (!rowData.ROW_ID) {
    throw new Error(`Missing ROW_ID at row ${rowIndex}`)
  }

  if (!rowData.DATE_RECEIVED_FOR_REPROCESSING) {
    throw new Error(`Missing DATE_RECEIVED_FOR_REPROCESSING at row ${rowIndex}`)
  }

  return {
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
    rowId: rowData.ROW_ID,
    data: rowData
  }
}
