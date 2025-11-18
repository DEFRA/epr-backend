import { createValidationIssues } from '#common/validation/validation-issues.js'
import { VALIDATION_CATEGORY } from '#common/enums/validation.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import {
  buildMetaFieldLocation,
  extractMetaField,
  logValidationSuccess
} from './helpers.js'

/**
 * Mapping between spreadsheet type values and registration waste processing types
 */
const PROCESSING_TYPE_MAP = Object.freeze({
  REPROCESSOR: 'reprocessor',
  EXPORTER: 'exporter'
})

const VALID_REGISTRATION_TYPES = Object.values(PROCESSING_TYPE_MAP)

/**
 * Validates that the summary log type in the spreadsheet matches the registration's waste processing type
 *
 * Uses functional validation pattern with helper functions instead of classes
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.loggingContext - Logging context message
 * @returns {Object} validation issues with any issues found
 */
export const validateProcessingType = ({
  parsed,
  registration,
  loggingContext
}) => {
  const issues = createValidationIssues()

  const { wasteProcessingType } = registration

  const processingTypeField = extractMetaField(
    parsed,
    SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE
  )
  const spreadsheetProcessingType = processingTypeField?.value

  const location = buildMetaFieldLocation(
    processingTypeField,
    SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE
  )

  if (!VALID_REGISTRATION_TYPES.includes(wasteProcessingType)) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Invalid summary log: registration has unexpected waste processing type',
      'UNEXPECTED_PROCESSING_TYPE',
      {
        expected: VALID_REGISTRATION_TYPES,
        actual: wasteProcessingType
      }
    )
    return issues
  }

  const expectedProcessingType = PROCESSING_TYPE_MAP[spreadsheetProcessingType]

  if (expectedProcessingType !== wasteProcessingType) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Summary log processing type does not match registration processing type',
      'PROCESSING_TYPE_MISMATCH',
      {
        location,
        expected: expectedProcessingType,
        actual: wasteProcessingType
      }
    )
    return issues
  }

  logValidationSuccess(
    `Summary log type validated: ${loggingContext}, spreadsheetType=${spreadsheetProcessingType}, wasteProcessingType=${wasteProcessingType}`
  )

  return issues
}
