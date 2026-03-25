import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/reprocessor-registered-only/fields.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'

const rowIdField = RECEIVED_LOADS_FIELDS.ROW_ID
const monthField = RECEIVED_LOADS_FIELDS.MONTH_RECEIVED_FOR_REPROCESSING

/**
 * Transforms a row from RECEIVED_LOADS_FOR_REPROCESSING table into waste record metadata
 * (Reprocessor Registered-Only)
 *
 * @param {Record<string, any>} rowData - Row data mapped from headers
 * @param {number} rowIndex - Row index for error messages
 * @returns {{wasteRecordType: string, rowId: string, data: Record<string, any>}}
 * @throws {Error} If required fields are missing
 */
export const transformReceivedLoadsRowRegisteredOnly = (rowData, rowIndex) => {
  if (!rowData[rowIdField]) {
    throw new Error(`Missing ${rowIdField} at row ${rowIndex}`)
  }

  const data = {
    ...rowData,
    processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
  }

  // The Excel template stores month as a first-of-month date (e.g. '2026-03-01').
  // Strip the day portion so the persisted value reflects month granularity ('2026-03').
  if (data[monthField]) {
    data[monthField] = toYearMonth(data[monthField])
  }

  return {
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
    rowId: rowData[rowIdField],
    data
  }
}
