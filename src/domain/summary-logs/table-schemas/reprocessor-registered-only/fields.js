/**
 * Field name constants for reprocessor-registered-only tables
 *
 * Single source of truth for field names used throughout schemas in this folder.
 * Registered-only reprocessors have simplified column sets compared to accredited:
 * - No detailed weighing (gross/tare/pallet/bailing wire)
 * - No waste classification (EWC codes, waste descriptions, PRN/PERN)
 * - No carrier fields (carrier name, CBD reg number, vehicle registration)
 * - No reference fields (your reference, weighbridge ticket)
 * - Monthly granularity (MONTH_RECEIVED_FOR_REPROCESSING) instead of daily dates
 * - No REPROCESSED_LOADS table (no waste balance to track outputs against)
 */

/**
 * ROW_ID minimum values for REPROCESSOR_REGISTERED_ONLY tables
 *
 * Different tables have different ROW_ID starting offsets to ensure
 * ROW_ID values do not overlap across any table in the spreadsheet.
 */
export const ROW_ID_MINIMUMS = Object.freeze({
  RECEIVED_LOADS_FOR_REPROCESSING: 1000,
  SENT_ON_LOADS: 5000
})

export const RECEIVED_LOADS_FIELDS = Object.freeze({
  ROW_ID: 'ROW_ID',
  MONTH_RECEIVED_FOR_REPROCESSING: 'MONTH_RECEIVED_FOR_REPROCESSING',
  NET_WEIGHT: 'NET_WEIGHT',
  HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION:
    'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
  RECYCLABLE_PROPORTION_PERCENTAGE: 'RECYCLABLE_PROPORTION_PERCENTAGE',
  TONNAGE_RECEIVED_FOR_RECYCLING: 'TONNAGE_RECEIVED_FOR_RECYCLING',
  SUPPLIER_NAME: 'SUPPLIER_NAME',
  SUPPLIER_ADDRESS: 'SUPPLIER_ADDRESS',
  SUPPLIER_POSTCODE: 'SUPPLIER_POSTCODE',
  SUPPLIER_EMAIL: 'SUPPLIER_EMAIL',
  SUPPLIER_PHONE_NUMBER: 'SUPPLIER_PHONE_NUMBER',
  ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER'
})

export const SENT_ON_LOADS_FIELDS = Object.freeze({
  ROW_ID: 'ROW_ID',
  DATE_LOAD_LEFT_SITE: 'DATE_LOAD_LEFT_SITE',
  TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON:
    'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON',
  FINAL_DESTINATION_FACILITY_TYPE: 'FINAL_DESTINATION_FACILITY_TYPE',
  FINAL_DESTINATION_NAME: 'FINAL_DESTINATION_NAME',
  FINAL_DESTINATION_ADDRESS: 'FINAL_DESTINATION_ADDRESS',
  FINAL_DESTINATION_POSTCODE: 'FINAL_DESTINATION_POSTCODE'
})
