/**
 * Field name constants for reprocessor-input tables
 *
 * Single source of truth for field names used throughout schemas in this folder.
 */

// Re-export shared fields
export { SENT_ON_LOADS_FIELDS } from '../shared/index.js'
export { RECEIVED_LOADS_FOR_REPROCESSING_FIELDS as RECEIVED_LOADS_FIELDS } from '../shared/index.js'

/**
 * ROW_ID minimum values for REPROCESSOR_INPUT tables
 *
 * Different tables have different ROW_ID starting offsets to ensure
 * ROW_ID values do not overlap across any table in the spreadsheet.
 */
export const ROW_ID_MINIMUMS = Object.freeze({
  RECEIVED_LOADS_FOR_REPROCESSING: 1000,
  REPROCESSED_LOADS: 4000,
  SENT_ON_LOADS: 5000
})

export const REPROCESSED_LOADS_FIELDS = Object.freeze({
  ROW_ID: 'ROW_ID',
  DATE_LOAD_LEFT_SITE: 'DATE_LOAD_LEFT_SITE',
  PRODUCT_DESCRIPTION: 'PRODUCT_DESCRIPTION',
  END_OF_WASTE_STANDARDS: 'END_OF_WASTE_STANDARDS',
  PRODUCT_TONNAGE: 'PRODUCT_TONNAGE',
  WEIGHBRIDGE_TICKET_NUMBER: 'WEIGHBRIDGE_TICKET_NUMBER',
  HAULIER_NAME: 'HAULIER_NAME',
  HAULIER_VEHICLE_REGISTRATION_NUMBER: 'HAULIER_VEHICLE_REGISTRATION_NUMBER',
  CUSTOMER_NAME: 'CUSTOMER_NAME',
  CUSTOMER_INVOICE_REFERENCE: 'CUSTOMER_INVOICE_REFERENCE'
})
