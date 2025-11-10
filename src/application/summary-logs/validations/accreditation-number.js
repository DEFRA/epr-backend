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
 * Validates that the accreditation number in the spreadsheet matches the registration's accreditation number
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.loggingContext - Logging context message
 * @returns {Object} validation issues with any issues found
 */
export const validateAccreditationNumber = ({
  parsed,
  registration,
  loggingContext
}) => {
  const issues = createValidationIssues()

  const accreditationNumber = registration.accreditation?.accreditationNumber
  const accreditationField =
    parsed?.meta?.[SUMMARY_LOG_META_FIELDS.ACCREDITATION]
  const spreadsheetAccreditationNumber = accreditationField?.value

  const location = accreditationField?.location
    ? { ...accreditationField.location }
    : undefined

  // Case 1: Registration has accreditation → spreadsheet MUST match
  if (accreditationNumber) {
    if (!spreadsheetAccreditationNumber) {
      issues.addFatal(
        VALIDATION_CATEGORY.BUSINESS,
        'Invalid summary log: missing accreditation number',
        {
          path: `meta.${SUMMARY_LOG_META_FIELDS.ACCREDITATION}`,
          location
        }
      )
      return issues
    }

    if (spreadsheetAccreditationNumber !== accreditationNumber) {
      issues.addFatal(
        VALIDATION_CATEGORY.BUSINESS,
        "Summary log's accreditation number does not match this registration",
        {
          path: `meta.${SUMMARY_LOG_META_FIELDS.ACCREDITATION}`,
          location,
          expected: accreditationNumber,
          actual: spreadsheetAccreditationNumber
        }
      )
      return issues
    }
  }

  // Case 2: Registration has NO accreditation → spreadsheet MUST be blank
  if (!accreditationNumber && spreadsheetAccreditationNumber) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Invalid summary log: accreditation number provided but registration has no accreditation',
      {
        path: `meta.${SUMMARY_LOG_META_FIELDS.ACCREDITATION}`,
        location,
        actual: spreadsheetAccreditationNumber
      }
    )
    return issues
  }

  logger.info({
    message: `Accreditation number validated: ${loggingContext}, accreditationNumber=${accreditationNumber || 'none'}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return issues
}
