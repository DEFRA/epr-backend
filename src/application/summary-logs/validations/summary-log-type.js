import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  createValidationIssues,
  VALIDATION_CATEGORY
} from '#common/validation/validation-issues.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'

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

  const processingTypeField = parsed?.meta?.PROCESSING_TYPE
  const spreadsheetProcessingType = processingTypeField?.value

  const location = processingTypeField?.location
    ? { ...processingTypeField.location }
    : undefined

  if (!VALID_REGISTRATION_TYPES.includes(wasteProcessingType)) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Invalid summary log: registration has unexpected waste processing type',
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
      {
        path: `meta.${SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE}`,
        location,
        expected: expectedProcessingType,
        actual: wasteProcessingType
      }
    )
    return issues
  }

  logger.info({
    message: `Summary log type validated: ${loggingContext}, spreadsheetType=${spreadsheetProcessingType}, wasteProcessingType=${wasteProcessingType}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return issues
}
