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
  const accreditationField = extractMetaField(
    parsed,
    SUMMARY_LOG_META_FIELDS.ACCREDITATION_NUMBER
  )
  const rawAccreditationValue = accreditationField?.value
  const spreadsheetAccreditationNumber =
    rawAccreditationValue == null
      ? rawAccreditationValue
      : String(rawAccreditationValue).trim()

  const location = buildMetaFieldLocation(
    accreditationField,
    SUMMARY_LOG_META_FIELDS.ACCREDITATION_NUMBER
  )

  // Case 1: Registration has accreditation → spreadsheet MUST match
  if (accreditationNumber) {
    if (!spreadsheetAccreditationNumber) {
      issues.addFatal(
        VALIDATION_CATEGORY.BUSINESS,
        'Invalid summary log: missing accreditation number',
        VALIDATION_CODE.ACCREDITATION_MISSING,
        {
          location
        }
      )
      return issues
    }

    if (spreadsheetAccreditationNumber !== accreditationNumber) {
      issues.addFatal(
        VALIDATION_CATEGORY.BUSINESS,
        "Summary log's accreditation number does not match this registration",
        VALIDATION_CODE.ACCREDITATION_MISMATCH,
        {
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
      VALIDATION_CODE.ACCREDITATION_UNEXPECTED,
      {
        location,
        actual: spreadsheetAccreditationNumber
      }
    )
    return issues
  }

  logValidationSuccess(
    `Accreditation number validated: ${loggingContext}, accreditationNumber=${accreditationNumber || 'none'}`
  )

  return issues
}
