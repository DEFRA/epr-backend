import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  PROCESSING_TYPE_TABLES,
  TABLE_NAMES
} from '#domain/summary-logs/table-schemas/index.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

const { rowIdField } =
  PROCESSING_TYPE_TABLES[PROCESSING_TYPES.REPROCESSOR_INPUT][
    TABLE_NAMES.RECEIVED_LOADS_FOR_REPROCESSING
  ]

/**
 * Transforms a row from RECEIVED_LOADS_FOR_REPROCESSING table into waste record metadata
 *
 * @param {Record<string, any>} rowData - Row data mapped from headers
 * @param {number} rowIndex - Row index for error messages
 * @returns {{wasteRecordType: string, rowId: string, data: Record<string, any>}}
 * @throws {Error} If required fields are missing
 */
export const transformReceivedLoadsRow = (rowData, rowIndex) => {
  if (!rowData[rowIdField]) {
    throw new Error(`Missing ${rowIdField} at row ${rowIndex}`)
  }

  if (!rowData.DATE_RECEIVED_FOR_REPROCESSING) {
    throw new Error(`Missing DATE_RECEIVED_FOR_REPROCESSING at row ${rowIndex}`)
  }

  return {
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
    rowId: rowData[rowIdField],
    data: {
      ...rowData,
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
    }
  }
}
