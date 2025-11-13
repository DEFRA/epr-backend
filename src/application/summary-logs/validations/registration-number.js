import {
  createValidationIssues,
  VALIDATION_CATEGORY
} from '#common/validation/validation-issues.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import {
  buildMetaFieldLocation,
  extractMetaField,
  logValidationSuccess
} from './helpers.js'

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

  const registrationField = extractMetaField(
    parsed,
    SUMMARY_LOG_META_FIELDS.REGISTRATION
  )
  const spreadsheetRegistrationNumber = registrationField?.value

  const location = buildMetaFieldLocation(
    registrationField,
    SUMMARY_LOG_META_FIELDS.REGISTRATION
  )

  if (!wasteRegistrationNumber) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Invalid summary log: registration has no waste registration number',
      'MISSING_REGISTRATION_NUMBER'
    )
    return issues
  }

  if (spreadsheetRegistrationNumber !== wasteRegistrationNumber) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      "Summary log's waste registration number does not match this registration",
      'REGISTRATION_MISMATCH',
      {
        location,
        expected: wasteRegistrationNumber,
        actual: spreadsheetRegistrationNumber
      }
    )
    return issues
  }

  logValidationSuccess(
    `Registration number validated: ${loggingContext}, registrationNumber=${wasteRegistrationNumber}`
  )

  return issues
}
