/**
 * Meta section field names (uppercase with underscores, as they appear in parsed.meta)
 * These are the fields from the "Cover" sheet that contain summary log metadata
 */
export const SUMMARY_LOG_META_FIELDS = Object.freeze({
  PROCESSING_TYPE: 'PROCESSING_TYPE',
  TEMPLATE_VERSION: 'TEMPLATE_VERSION',
  MATERIAL: 'MATERIAL',
  ACCREDITATION_NUMBER: 'ACCREDITATION_NUMBER',
  REGISTRATION_NUMBER: 'REGISTRATION_NUMBER'
})

/**
 * Valid PROCESSING_TYPE values that can appear in summary log spreadsheets
 */
export const PROCESSING_TYPES = Object.freeze({
  REPROCESSOR_INPUT: 'REPROCESSOR_INPUT',
  REPROCESSOR_OUTPUT: 'REPROCESSOR_OUTPUT',
  EXPORTER: 'EXPORTER',
  EXPORTER_REGISTERED_ONLY: 'EXPORTER_REGISTERED_ONLY',
  REPROCESSOR_REGISTERED_ONLY: 'REPROCESSOR_REGISTERED_ONLY'
})

/**
 * Mapping from spreadsheet PROCESSING_TYPE values to registration wasteProcessingType values
 */
export const PROCESSING_TYPE_TO_WASTE_PROCESSING_TYPE = Object.freeze({
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: 'reprocessor',
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: 'reprocessor',
  [PROCESSING_TYPES.EXPORTER]: 'exporter',
  [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY]: 'exporter',
  [PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY]: 'reprocessor'
})

/**
 * Mapping from spreadsheet PROCESSING_TYPE values to registration reprocessingType values
 * Only applicable for reprocessors (REPROCESSOR_INPUT and REPROCESSOR_OUTPUT)
 */
export const PROCESSING_TYPE_TO_REPROCESSING_TYPE = Object.freeze({
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: 'input',
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: 'output'
})

/**
 * Per-field placeholder values for metadata fields in Excel templates.
 * When a metadata field contains its placeholder value, the parser
 * normalises it to null.
 */
export const META_PLACEHOLDERS = Object.freeze({
  [SUMMARY_LOG_META_FIELDS.MATERIAL]: 'Choose material'
})
