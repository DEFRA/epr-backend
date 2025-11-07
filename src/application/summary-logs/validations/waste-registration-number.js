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
 * Validates that the waste registration number in the spreadsheet matches the registration's waste registration number
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.loggingContext - Logging context message
 * @returns {Object} validation issues with any issues found
 */
export const validateRegistrationNumber = ({
  parsed,
  registration,
  loggingContext
}) => {
  const issues = createValidationIssues()

  const { wasteRegistrationNumber } = registration

  const registrationField = parsed?.meta?.[SUMMARY_LOG_META_FIELDS.REGISTRATION]
  const spreadsheetRegistrationNumber = registrationField?.value

  const location = registrationField?.location
    ? { ...registrationField.location }
    : undefined

  if (!wasteRegistrationNumber) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Invalid summary log: registration has no waste registration number'
    )
    return issues
  }

  if (spreadsheetRegistrationNumber !== wasteRegistrationNumber) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      "Summary log's waste registration number does not match this registration",
      {
        path: `meta.${SUMMARY_LOG_META_FIELDS.REGISTRATION}`,
        location,
        expected: wasteRegistrationNumber,
        actual: spreadsheetRegistrationNumber
      }
    )
    return issues
  }

  logger.info({
    message: `Registration number validated: ${loggingContext}, registrationNumber=${wasteRegistrationNumber}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return issues
}
