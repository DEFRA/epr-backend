/**
 * Valid methods for calculating recyclable proportion
 *
 * These are the allowed values for the HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION
 * field in the RECEIVED_LOADS_FOR_REPROCESSING table.
 */
export const RECYCLABLE_PROPORTION_METHODS = Object.freeze([
  'AAIG percentage',
  'Actual weight (100%)',
  'National protocol percentage',
  'S&I plan agreed methodology',
  'S&I plan agreed site-specific protocol percentage'
])
