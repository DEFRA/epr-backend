import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Validates that the accreditation number in the spreadsheet matches the registration's accreditation number
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.loggingContext - Logging context message
 * @throws {Error} If validation fails
 */
export const validateAccreditationNumber = ({
  parsed,
  registration,
  loggingContext
}) => {
  const accreditationNumber = registration.accreditation?.accreditationNumber
  const spreadsheetAccreditationNumber =
    parsed?.meta?.ACCREDITATION_NUMBER?.value

  // Case 1: Registration has accreditation → spreadsheet MUST match
  if (accreditationNumber) {
    if (!spreadsheetAccreditationNumber) {
      throw new Error('Invalid summary log: missing accreditation number')
    }

    if (spreadsheetAccreditationNumber !== accreditationNumber) {
      throw new Error(
        "Summary log's accreditation number does not match this registration"
      )
    }
  }

  // Case 2: Registration has NO accreditation → spreadsheet MUST be blank
  if (!accreditationNumber && spreadsheetAccreditationNumber) {
    throw new Error(
      'Invalid summary log: accreditation number provided but registration has no accreditation'
    )
  }

  logger.info({
    message: `Accreditation number validated: ${loggingContext}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}
