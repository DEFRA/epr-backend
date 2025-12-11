/**
 * Field name constants for reprocessor-output tables
 *
 * Single source of truth for field names used throughout schemas in this folder.
 */

/**
 * ROW_ID minimum values for REPROCESSOR_OUTPUT tables
 *
 * Different tables have different ROW_ID starting offsets to ensure
 * ROW_ID values do not overlap across any table in the spreadsheet.
 */
export const ROW_ID_MINIMUMS = Object.freeze({
  RECEIVED_LOADS_FOR_REPROCESSING: 1000,
  REPROCESSED_LOADS: 3000,
  SENT_ON_LOADS: 5000
})

export const REPROCESSED_LOADS_FIELDS = Object.freeze({
  ROW_ID: 'ROW_ID',
  DATE_LOAD_LEFT_SITE: 'DATE_LOAD_LEFT_SITE',
  PRODUCT_TONNAGE: 'PRODUCT_TONNAGE',
  UK_PACKAGING_WEIGHT_PERCENTAGE: 'UK_PACKAGING_WEIGHT_PERCENTAGE',
  PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION:
    'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
  ADD_PRODUCT_WEIGHT: 'ADD_PRODUCT_WEIGHT'
})
