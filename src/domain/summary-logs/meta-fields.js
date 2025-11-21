/**
 * Meta section field names (uppercase with underscores, as they appear in parsed.meta)
 * These are the fields from the "Cover" sheet that contain summary log metadata
 */
export const SUMMARY_LOG_META_FIELDS = Object.freeze({
  PROCESSING_TYPE: 'PROCESSING_TYPE',
  TEMPLATE_VERSION: 'TEMPLATE_VERSION',
  MATERIAL: 'MATERIAL',
  ACCREDITATION: 'ACCREDITATION',
  REGISTRATION: 'REGISTRATION'
})

/**
 * Valid PROCESSING_TYPE values that can appear in summary log spreadsheets
 */
export const PROCESSING_TYPES = Object.freeze({
  REPROCESSOR_INPUT: 'REPROCESSOR_INPUT',
  REPROCESSOR_OUTPUT: 'REPROCESSOR_OUTPUT',
  EXPORTER: 'EXPORTER'
})

/**
 * Mapping from spreadsheet PROCESSING_TYPE values to registration wasteProcessingType values
 */
export const PROCESSING_TYPE_TO_WASTE_PROCESSING_TYPE = Object.freeze({
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: 'reprocessor',
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: 'reprocessor',
  [PROCESSING_TYPES.EXPORTER]: 'exporter'
})
