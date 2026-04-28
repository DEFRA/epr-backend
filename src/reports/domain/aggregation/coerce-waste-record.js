/**
 * Read-time coercion for waste-record fields that downstream code consumes
 * as strings.
 *
 * Waste records are persisted with the values ExcelJS produced (e.g. a
 * numeric `0` for a supplier name cell). The Joi schemas in
 * `#reports/repository/schema.js` expect these fields as strings, so this
 * helper coerces numbers to strings on read without mutating the stored
 * data.
 *
 * Fields not in this set pass through untouched. Non-number values
 * (strings, null, undefined) pass through untouched too.
 */

const STRING_FIELDS = new Set([
  'SUPPLIER_NAME',
  'SUPPLIER_ADDRESS',
  'SUPPLIER_POSTCODE',
  'SUPPLIER_EMAIL',
  'SUPPLIER_PHONE_NUMBER',
  'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER',
  'YOUR_REFERENCE',
  'WEIGHBRIDGE_TICKET',
  'CARRIER_NAME',
  'CBD_REG_NUMBER',
  'CARRIER_VEHICLE_REGISTRATION_NUMBER',
  'FINAL_DESTINATION_NAME',
  'FINAL_DESTINATION_ADDRESS',
  'FINAL_DESTINATION_POSTCODE',
  'FINAL_DESTINATION_EMAIL',
  'FINAL_DESTINATION_PHONE',
  'FINAL_DESTINATION_FACILITY_TYPE'
])

/**
 * Returns row data with numeric values for known string fields coerced
 * to strings.
 *
 * @param {Record<string, any>} data
 * @returns {Record<string, any>}
 */
export const coerceWasteRecordData = (data) => {
  const result = {}
  for (const [key, value] of Object.entries(data)) {
    result[key] =
      STRING_FIELDS.has(key) && typeof value === 'number'
        ? String(value)
        : value
  }
  return result
}

/**
 * Maps an array of waste records, coercing each record's `data` for read.
 *
 * @template {{ data: Record<string, any> }} T
 * @param {T[]} wasteRecords
 * @returns {T[]}
 */
export const coerceWasteRecordsForRead = (wasteRecords) =>
  wasteRecords.map((record) => ({
    ...record,
    data: coerceWasteRecordData(record.data)
  }))
