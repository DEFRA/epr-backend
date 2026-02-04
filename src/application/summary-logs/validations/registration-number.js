import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import {
  buildMetaFieldLocation,
  extractMetaField,
  logValidationSuccess
} from './helpers.js'

/**
 * Validates that the registration number in the spreadsheet matches the registration's registration number
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

  const { registrationNumber } = registration

  const registrationField = extractMetaField(
    parsed,
    SUMMARY_LOG_META_FIELDS.REGISTRATION_NUMBER
  )
  const spreadsheetRegistrationNumber = registrationField?.value?.trim()

  const location = buildMetaFieldLocation(
    registrationField,
    SUMMARY_LOG_META_FIELDS.REGISTRATION_NUMBER
  )

  if (!registrationNumber) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Invalid summary log: registration has no registration number',
      VALIDATION_CODE.REGISTRATION_DATA_INVALID
    )
    return issues
  }

  if (spreadsheetRegistrationNumber !== registrationNumber) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      "Summary log's registration number does not match this registration",
      VALIDATION_CODE.REGISTRATION_MISMATCH,
      {
        location,
        expected: registrationNumber,
        actual: spreadsheetRegistrationNumber
      }
    )
    return issues
  }

  logValidationSuccess(
    `Registration number validated: ${loggingContext}, registrationNumber=${registrationNumber}`
  )

  return issues
}
