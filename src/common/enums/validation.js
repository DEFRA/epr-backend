/**
 * Severity levels for validation issues
 */
export const VALIDATION_SEVERITY = Object.freeze({
  FATAL: 'fatal',
  ERROR: 'error',
  WARNING: 'warning'
})

/**
 * Categories of validation issues
 */
export const VALIDATION_CATEGORY = Object.freeze({
  PARSING: 'parsing',
  TECHNICAL: 'technical',
  BUSINESS: 'business'
})

/**
 * Error codes for validation issues
 * These codes are used for i18n/translation on the client side
 * See ADR 0020 for complete documentation
 */
export const VALIDATION_CODE = Object.freeze({
  // Meta-level validation codes
  INVALID_META_FIELD: 'INVALID_META_FIELD',
  REGISTRATION_MISMATCH: 'REGISTRATION_MISMATCH',
  PROCESSING_TYPE_MISMATCH: 'PROCESSING_TYPE_MISMATCH',
  MATERIAL_MISMATCH: 'MATERIAL_MISMATCH',
  ACCREDITATION_MISMATCH: 'ACCREDITATION_MISMATCH',
  MISSING_ACCREDITATION_NUMBER: 'MISSING_ACCREDITATION_NUMBER',
  UNEXPECTED_ACCREDITATION_NUMBER: 'UNEXPECTED_ACCREDITATION_NUMBER',

  // Data-level validation codes
  MISSING_REQUIRED_HEADER: 'MISSING_REQUIRED_HEADER',
  FIELD_REQUIRED: 'FIELD_REQUIRED',
  INVALID_TYPE: 'INVALID_TYPE',
  VALUE_OUT_OF_RANGE: 'VALUE_OUT_OF_RANGE',
  INVALID_FORMAT: 'INVALID_FORMAT',
  INVALID_DATE: 'INVALID_DATE',
  SEQUENTIAL_ROW_REMOVED: 'SEQUENTIAL_ROW_REMOVED',

  // Generic/fallback codes
  VALIDATION_FALLBACK_ERROR: 'VALIDATION_FALLBACK_ERROR', // Unmapped Joi validation types
  VALIDATION_SYSTEM_ERROR: 'VALIDATION_SYSTEM_ERROR' // System failures during validation
})
